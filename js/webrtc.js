import { db, auth } from './firebase-config.js';
import { 
    collection, doc, setDoc, addDoc, getDoc, updateDoc, onSnapshot, 
    getDocs, query, where, limit, deleteDoc, orderBy, serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { setupChat, stopChat } from './chat.js';

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomId = null;
let roomRef = null;
let unsubRoom = null;
let unsubCandidates = null;
let isCaller = false;
let heartbeatInterval = null;
let remoteCandidatesQueue = [];

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
};

export async function initMedia(localVideoElement) {
    if (localStream && localStream.active) {
        if (localVideoElement && localVideoElement.srcObject !== localStream) {
            localVideoElement.srcObject = localStream;
        }
        return { success: true };
    }
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideoElement) {
            localVideoElement.srcObject = localStream;
            localVideoElement.play().catch(() => {});
        }
        return { success: true };
    } catch (error) {
        console.warn("Media access failed, retrying with video only:", error);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            if (localVideoElement) {
                localVideoElement.srcObject = localStream;
                localVideoElement.play().catch(() => {});
            }
            return { success: true, warning: "Mic failed" };
        } catch (e) {
            return { success: false, message: "Camera access denied or not found." };
        }
    }
}

export function setMicGain(gain) {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => { track.enabled = gain > 0; });
    }
}

export async function sendEffectUpdate(effects) {
    if (roomRef) {
        const updateData = {};
        if (isCaller) {
            if (effects.mirror !== undefined) updateData.callerMirror = effects.mirror;
            if (effects.brightness !== undefined) updateData.callerBrightness = effects.brightness;
        } else {
            if (effects.mirror !== undefined) updateData.calleeMirror = effects.mirror;
            if (effects.brightness !== undefined) updateData.calleeBrightness = effects.brightness;
        }
        if (Object.keys(updateData).length > 0) {
            await updateDoc(roomRef, updateData).catch(() => {});
        }
    }
}

export async function findMatch(remoteVideoElement, myInfo, callbacks) {
    if (peerConnection) await hangup();
    
    const localVideoElement = document.getElementById('localVideo');
    const mediaResult = await initMedia(localVideoElement);
    if (!mediaResult.success) {
        callbacks.onStatus(mediaResult.message);
        return;
    }

    callbacks.onStatus("Searching for a stranger...");

    try {
        const roomsRef = collection(db, "chatRooms");
        const activeTimeThreshold = Date.now() - 15000; // 15s activity
        
        // Simplified query: No orderBy to avoid Index requirement
        const q = query(
            roomsRef, 
            where("status", "==", "waiting"),
            limit(20)
        );
        
        const querySnapshot = await getDocs(q);
        let joinedRoom = null;

        const docs = querySnapshot.docs;
        const shuffledDocs = docs.sort(() => Math.random() - 0.5);

        for (const roomDoc of shuffledDocs) {
            const data = roomDoc.data();
            const lastActive = data.lastActivity || 0;
            if (data.callerUid !== auth.currentUser.uid && lastActive > activeTimeThreshold) {
                try {
                    await runTransaction(db, async (transaction) => {
                        const rSnap = await transaction.get(roomDoc.ref);
                        if (rSnap.exists() && rSnap.data().status === "waiting") {
                            transaction.update(roomDoc.ref, { 
                                status: "joined",
                                calleeUid: auth.currentUser.uid,
                                calleeName: myInfo.name || 'Anonymous',
                                calleeInsta: myInfo.showInfo ? (myInfo.insta || '') : '',
                                calleeWhatsapp: myInfo.showInfo ? (myInfo.whatsapp || '') : '',
                                lastActivity: Date.now()
                            });
                            joinedRoom = { id: roomDoc.id, ref: roomDoc.ref, data: rSnap.data() };
                        }
                    });
                    if (joinedRoom) break;
                } catch (e) { console.warn("Join attempt failed, trying next"); }
            }
        }

        if (joinedRoom) {
            isCaller = false;
            roomId = joinedRoom.id;
            roomRef = joinedRoom.ref;
            await setupConnection(remoteVideoElement, myInfo, callbacks, joinedRoom.data.offer);
        } else {
            isCaller = true;
            roomRef = doc(collection(db, "chatRooms"));
            roomId = roomRef.id;
            await setupConnection(remoteVideoElement, myInfo, callbacks);
        }
    } catch (err) {
        console.error("Error finding match:", err);
        callbacks.onStatus("Searching..."); // Silently retry via main loop
        // Ensure we reset isConnecting in main.js
    }
}

export async function startDirectCall(remoteVideoElement, myInfo, callbacks, targetRoomId, forcedIsCaller = null) {
    if (peerConnection) await hangup();
    
    await initMedia(document.getElementById('localVideo'));

    if (targetRoomId) {
        roomId = targetRoomId;
        roomRef = doc(db, "chatRooms", roomId);
    } else {
        roomRef = doc(collection(db, "chatRooms"));
        roomId = roomRef.id;
    }

    if (forcedIsCaller !== null) {
        isCaller = forcedIsCaller;
    } else {
        const snap = await getDoc(roomRef);
        isCaller = !snap.exists() || snap.data().status !== "waiting";
    }

    // Reuse setupConnection for the actual WebRTC work
    const remoteOffer = !isCaller ? (await getDoc(roomRef)).data().offer : null;
    await setupConnection(remoteVideoElement, myInfo, callbacks, remoteOffer);
}

async function setupConnection(remoteVideoElement, myInfo, callbacks, remoteOffer = null) {
    peerConnection = new RTCPeerConnection(configuration);
    remoteCandidatesQueue = [];

    // ICE Candidate handling
    peerConnection.onicecandidate = e => {
        if (!e.candidate || !roomRef) return;
        const candidateCol = collection(roomRef, "candidates");
        addDoc(candidateCol, {
            ...e.candidate.toJSON(),
            type: isCaller ? "caller" : "callee",
            createdAt: Date.now()
        }).catch(() => {});
    };

    // Track handling
    peerConnection.ontrack = e => {
        console.log("Remote track received");
        const stream = e.streams[0] || new MediaStream([e.track]);
        remoteVideoElement.srcObject = stream;
        remoteStream = stream;
        remoteVideoElement.play().then(() => {
            callbacks.onStatus("Connected!");
        }).catch(() => {
            callbacks.onStatus("Connected!");
        });
    };

    // Connection state
    peerConnection.oniceconnectionstatechange = () => {
        if (!peerConnection) return;
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            callbacks.onDisconnect();
        }
    };

    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    }

    // Signaling setup
    if (isCaller) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        await setDoc(roomRef, {
            offer: { type: offer.type, sdp: offer.sdp },
            status: "waiting",
            callerUid: auth.currentUser.uid,
            callerName: myInfo.name || 'Anonymous',
            callerInsta: myInfo.showInfo ? (myInfo.insta || '') : '',
            callerWhatsapp: myInfo.showInfo ? (myInfo.whatsapp || '') : '',
            lastActivity: Date.now(),
            createdAt: Date.now()
        });

        // Listen for Answer
        unsubRoom = onSnapshot(roomRef, async s => {
            const d = s.data();
            if (!d) return;
            if (d.status === "joined" && d.answer && !peerConnection.currentRemoteDescription) {
                console.log("Setting remote answer");
                await peerConnection.setRemoteDescription(new RTCSessionDescription(d.answer));
                if (callbacks.onPartnerSocial) {
                    callbacks.onPartnerSocial(d.calleeInsta, d.calleeWhatsapp, { uid: d.calleeUid, name: d.calleeName });
                }
                processQueuedCandidates();
            }
            if (callbacks.onPartnerEffect) {
                callbacks.onPartnerEffect({ mirror: d.calleeMirror, brightness: d.calleeBrightness });
            }
        });
    } else {
        // Callee
        if (callbacks.onPartnerSocial) {
            callbacks.onPartnerSocial(remoteOffer.callerInsta, remoteOffer.callerWhatsapp, { uid: remoteOffer.callerUid, name: remoteOffer.callerName });
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(remoteOffer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        await updateDoc(roomRef, { 
            answer: { type: answer.type, sdp: answer.sdp },
            lastActivity: Date.now()
        });

        // Listen for effects only
        unsubRoom = onSnapshot(roomRef, s => {
            const d = s.data();
            if (!d) return;
            if (callbacks.onPartnerEffect) {
                callbacks.onPartnerEffect({ mirror: d.callerMirror, brightness: d.callerBrightness });
            }
        });
        
        processQueuedCandidates();
    }

    // ICE Candidate Listener (Subcollection)
    const candidateCol = collection(roomRef, "candidates");
    unsubCandidates = onSnapshot(candidateCol, s => {
        s.docChanges().forEach(c => {
            if (c.type === "added") {
                const data = c.doc.data();
                const targetType = isCaller ? "callee" : "caller";
                if (data.type === targetType) {
                    if (peerConnection.remoteDescription) {
                        peerConnection.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
                    } else {
                        remoteCandidatesQueue.push(data);
                    }
                }
            }
        });
    });

    // Heartbeat
    heartbeatInterval = setInterval(async () => {
        if (roomRef) await updateDoc(roomRef, { lastActivity: Date.now() }).catch(() => {});
    }, 5000);

    setupChat(roomId, callbacks.onMessage);
}

function processQueuedCandidates() {
    if (!peerConnection || !peerConnection.remoteDescription) return;
    while (remoteCandidatesQueue.length > 0) {
        const cand = remoteCandidatesQueue.shift();
        peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    }
}

export async function hangup() {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    if (unsubRoom) { unsubRoom(); unsubRoom = null; }
    if (unsubCandidates) { unsubCandidates(); unsubCandidates = null; }
    
    if (roomId && roomRef) {
        stopChat();
        const currentRoomRef = roomRef;
        // Background cleanup
        (async () => {
            try {
                const candCol = collection(currentRoomRef, "candidates");
                const cSnap = await getDocs(candCol);
                for (const c of cSnap.docs) await deleteDoc(c.ref);
                const msgCol = collection(currentRoomRef, "messages");
                const mSnap = await getDocs(msgCol);
                for (const m of mSnap.docs) await deleteDoc(m.ref);
                await deleteDoc(currentRoomRef);
            } catch (e) {}
        })();
        roomId = null; roomRef = null;
    }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    remoteStream = null;
    remoteCandidatesQueue = [];
}
