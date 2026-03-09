import { db } from './firebase-config.js';
import { collection, doc, setDoc, addDoc, getDoc, updateDoc, onSnapshot, getDocs, query, where, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { setupChat, stopChat } from './chat.js';

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomId = null;
let roomRef = null;
let unsubRoom = null;
let unsubCallerCandidates = null;
let unsubCalleeCandidates = null;
let isCaller = false;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ]
};

export async function initMedia(localVideoElement) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideoElement.srcObject = localStream;
        return true;
    } catch (error) {
        console.error("Error accessing media devices.", error);
        return false;
    }
}

export async function findMatch(remoteVideoElement, myInfo, callbacks) {
    if (peerConnection) {
        await hangup();
    }
    
    if (!localStream) {
        callbacks.onStatus("Requesting camera access...");
        const localVideoElement = document.getElementById('localVideo');
        const success = await initMedia(localVideoElement);
        if (!success) {
            callbacks.onStatus("Camera permission required to match.");
            callbacks.onDisconnect();
            return;
        }
    }
    
    callbacks.onStatus("Searching for a stranger...");
    
    const roomsRef = collection(db, "chatRooms");
    let q;
    if (myInfo.prefGender !== "any") {
        q = query(roomsRef, where("status", "==", "waiting"), where("callerGender", "==", myInfo.prefGender), limit(1));
    } else {
        q = query(roomsRef, where("status", "==", "waiting"), limit(1));
    }
    
    const querySnapshot = await getDocs(q);
    
    peerConnection = new RTCPeerConnection(configuration);
    
    const pendingLocalCandidates = [];
    const remoteCandidatesQueue = [];

    peerConnection.addEventListener('icecandidate', event => {
        if (!event.candidate) { return; }
        if (roomRef) {
            const candidatesCollection = isCaller ? 'callerCandidates' : 'calleeCandidates';
            addDoc(collection(roomRef, candidatesCollection), event.candidate.toJSON());
        } else {
            pendingLocalCandidates.push(event.candidate);
        }
    });

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.addEventListener('track', event => {
        if (event.streams && event.streams[0]) {
            remoteVideoElement.srcObject = event.streams[0];
            remoteStream = event.streams[0];
            remoteVideoElement.play().catch(e => console.warn("Remote video play failed:", e));
            callbacks.onStatus("Connected!");
        }
    });
    
    peerConnection.addEventListener('connectionstatechange', event => {
        console.log("Connection state:", peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
            callbacks.onDisconnect();
            hangup();
        } else if (peerConnection.connectionState === 'disconnected') {
            callbacks.onStatus("Reconnecting...");
        }
    });

    if (!querySnapshot.empty) {
        isCaller = false;
        const roomDoc = querySnapshot.docs[0];
        roomId = roomDoc.id;
        roomRef = doc(db, "chatRooms", roomId);
        
        await updateDoc(roomRef, {
            status: "joined",
            calleeGender: myInfo.gender || 'unspecified',
            calleeName: myInfo.name || 'Anonymous',
            calleeInsta: myInfo.showInfo ? (myInfo.insta || '') : '',
            calleeWhatsapp: myInfo.showInfo ? (myInfo.whatsapp || '') : ''
        });

        // Add pending local candidates for Callee
        pendingLocalCandidates.forEach(candidate => {
            addDoc(collection(roomRef, 'calleeCandidates'), candidate.toJSON());
        });
        pendingLocalCandidates.length = 0;

        setupChat(roomId, callbacks.onMessage);
        
        const data = roomDoc.data();
        if(callbacks.onPartnerSocial) {
            callbacks.onPartnerSocial(data.callerInsta, data.callerWhatsapp);
        }
        if(callbacks.onPartnerInfo) {
            callbacks.onPartnerInfo({
                name: data.callerName || 'Anonymous',
                gender: data.callerGender || 'unspecified'
            });
        }

        const offer = data.offer;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        while (remoteCandidatesQueue.length > 0) {
            const candidate = remoteCandidatesQueue.shift();
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } });
        
        unsubRoom = onSnapshot(roomRef, snapshot => {
            if (!snapshot.exists()) {
                callbacks.onDisconnect();
                hangup();
            }
        });

        unsubCallerCandidates = onSnapshot(collection(roomRef, 'callerCandidates'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    let candidateData = change.doc.data();
                    try {
                        if (peerConnection.remoteDescription) {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
                        } else {
                            remoteCandidatesQueue.push(candidateData);
                        }
                    } catch (e) {
                        console.error("Error adding received ice candidate", e);
                    }
                }
            });
        });
        
    } else {
        isCaller = true;
        roomRef = doc(collection(db, "chatRooms"));
        roomId = roomRef.id;
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        const roomWithOffer = {
            offer: { type: offer.type, sdp: offer.sdp },
            status: "waiting",
            callerGender: myInfo.gender || 'unspecified',
            callerName: myInfo.name || 'Anonymous',
            callerInsta: myInfo.showInfo ? (myInfo.insta || '') : '',
            callerWhatsapp: myInfo.showInfo ? (myInfo.whatsapp || '') : '',
            createdAt: Date.now()
        };
        
        await setDoc(roomRef, roomWithOffer);
        
        pendingLocalCandidates.forEach(candidate => {
            addDoc(collection(roomRef, 'callerCandidates'), candidate.toJSON());
        });
        pendingLocalCandidates.length = 0;

        setupChat(roomId, callbacks.onMessage);
        
        let partnerInfoFired = false;
        unsubRoom = onSnapshot(roomRef, async snapshot => {
            const data = snapshot.data();
            if (!data) {
                callbacks.onDisconnect();
                hangup();
                return;
            }
            
            if (!peerConnection.currentRemoteDescription && data.answer) {
                const rtcSessionDescription = new RTCSessionDescription(data.answer);
                await peerConnection.setRemoteDescription(rtcSessionDescription);
                
                while (remoteCandidatesQueue.length > 0) {
                    const candidate = remoteCandidatesQueue.shift();
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
            }
            if (data.status === "joined") {
                if (callbacks.onPartnerSocial) {
                    callbacks.onPartnerSocial(data.calleeInsta, data.calleeWhatsapp);
                }
                if (!partnerInfoFired && callbacks.onPartnerInfo) {
                    partnerInfoFired = true;
                    callbacks.onPartnerInfo({
                        name: data.calleeName || 'Anonymous',
                        gender: data.calleeGender || 'unspecified'
                    });
                }
            }
        });
        
        unsubCalleeCandidates = onSnapshot(collection(roomRef, 'calleeCandidates'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    let candidateData = change.doc.data();
                    try {
                        if (peerConnection.remoteDescription) {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
                        } else {
                            remoteCandidatesQueue.push(candidateData);
                        }
                    } catch (e) {
                        console.error("Error adding received ice candidate", e);
                    }
                }
            });
        });
    }
}

export async function hangup() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (unsubRoom) { unsubRoom(); unsubRoom = null; }
    if (unsubCallerCandidates) { unsubCallerCandidates(); unsubCallerCandidates = null; }
    if (unsubCalleeCandidates) { unsubCalleeCandidates(); unsubCalleeCandidates = null; }
    
    if (roomId) {
        stopChat();
        if (roomRef) {
            try {
                const roomDoc = await getDoc(roomRef);
                if (roomDoc.exists()) {
                    const messagesRef = collection(roomRef, "messages");
                    const messagesSnap = await getDocs(messagesRef);
                    messagesSnap.forEach((docSnap) => {
                        deleteDoc(docSnap.ref);
                    });
                    
                    const callerCandidates = await getDocs(collection(roomRef, 'callerCandidates'));
                    callerCandidates.forEach((docSnap) => {
                        deleteDoc(docSnap.ref);
                    });
                    
                    const calleeCandidates = await getDocs(collection(roomRef, 'calleeCandidates'));
                    calleeCandidates.forEach((docSnap) => {
                        deleteDoc(docSnap.ref);
                    });

                    await deleteDoc(roomRef);
                }
            } catch (e) {
                console.error("Error during room cleanup:", e);
            }
        }
        roomId = null;
        roomRef = null;
    }
    
    remoteStream = null;
}
