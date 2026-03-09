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
    
    // Track pending candidates to avoid adding them before remote description
    const pendingCandidates = [];

    peerConnection.addEventListener('icecandidate', event => {
        if (!event.candidate) { return; }
        // Ensure roomRef is ready before adding candidate to DB
        if (roomRef) {
            const candidatesCollection = isCaller ? 'callerCandidates' : 'calleeCandidates';
            addDoc(collection(roomRef, candidatesCollection), event.candidate.toJSON());
        } else {
            // If roomRef not ready yet (Caller case), we'll add them after setting the doc
            pendingCandidates.push(event.candidate);
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
            callbacks.onStatus("Connected!");
        }
    });
    
    peerConnection.addEventListener('connectionstatechange', event => {
        console.log("Connection state:", peerConnection.connectionState);
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            callbacks.onDisconnect();
            hangup();
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
            calleeInsta: myInfo.insta || '',
            calleeWhatsapp: myInfo.whatsapp || ''
        });

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
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } });
        
        unsubCallerCandidates = onSnapshot(collection(roomRef, 'callerCandidates'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    let candidateData = change.doc.data();
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
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
            callerInsta: myInfo.insta || '',
            callerWhatsapp: myInfo.whatsapp || '',
            createdAt: Date.now()
        };
        
        await setDoc(roomRef, roomWithOffer);
        
        // Now that roomRef is set, add any pending candidates
        const candidatesCollection = 'callerCandidates';
        pendingCandidates.forEach(candidate => {
            addDoc(collection(roomRef, candidatesCollection), candidate.toJSON());
        });
        pendingCandidates.length = 0;

        setupChat(roomId, callbacks.onMessage);
        
        let partnerInfoFired = false;
        unsubRoom = onSnapshot(roomRef, async snapshot => {
            const data = snapshot.data();
            if (!data) return;
            
            if (!peerConnection.currentRemoteDescription && data.answer) {
                const rtcSessionDescription = new RTCSessionDescription(data.answer);
                await peerConnection.setRemoteDescription(rtcSessionDescription);
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
                            // Rare case where candidate arrives before answer is processed locally
                            console.warn("Received candidate before remote description, skipping for now.");
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
                // Delete messages subcollection
                const messagesRef = collection(roomRef, "messages");
                const messagesSnap = await getDocs(messagesRef);
                messagesSnap.forEach((docSnap) => {
                    deleteDoc(docSnap.ref);
                });
                
                // Delete caller candidates
                const callerCandidates = await getDocs(collection(roomRef, 'callerCandidates'));
                callerCandidates.forEach((docSnap) => {
                    deleteDoc(docSnap.ref);
                });
                
                // Delete callee candidates
                const calleeCandidates = await getDocs(collection(roomRef, 'calleeCandidates'));
                calleeCandidates.forEach((docSnap) => {
                    deleteDoc(docSnap.ref);
                });

                // Finally delete the room document itself
                await deleteDoc(roomRef);
            } catch (e) {
                console.error("Error during room cleanup:", e);
            }
        }
        roomId = null;
        roomRef = null;
    }
    
    remoteStream = null;
}
