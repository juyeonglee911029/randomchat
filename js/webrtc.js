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
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
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
    
    // 1. Check for waiting rooms
    const roomsRef = collection(db, "chatRooms");
    
    // We try to match based on preferences, but keep it simple first
    let q;
    if (myInfo.prefGender !== "any") {
        q = query(roomsRef, where("status", "==", "waiting"), where("callerGender", "==", myInfo.prefGender), limit(1));
    } else {
        q = query(roomsRef, where("status", "==", "waiting"), limit(1));
    }
    
    const querySnapshot = await getDocs(q);
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Listen for local ICE candidates
    peerConnection.addEventListener('icecandidate', event => {
        if (!event.candidate) { return; }
        if (roomRef) {
            const candidatesCollection = isCaller ? 'callerCandidates' : 'calleeCandidates';
            addDoc(collection(roomRef, candidatesCollection), event.candidate.toJSON());
        }
    });

    // Add local tracks to connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Listen for remote tracks
    peerConnection.addEventListener('track', event => {
        event.streams[0].getTracks().forEach(track => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteVideoElement.srcObject = remoteStream;
            }
            remoteStream.addTrack(track);
        });
        callbacks.onStatus("Connected!");
    });
    
    // Listen for connection state changes
    peerConnection.addEventListener('connectionstatechange', event => {
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            callbacks.onDisconnect();
            hangup();
        }
    });

    if (!querySnapshot.empty) {
        // Join existing room as Callee
        isCaller = false;
        const roomDoc = querySnapshot.docs[0];
        roomId = roomDoc.id;
        roomRef = doc(db, "chatRooms", roomId);
        
        // Update room status
        await updateDoc(roomRef, {
            status: "joined",
            calleeGender: myInfo.gender || 'unspecified',
            calleeName: myInfo.name || 'Anonymous',
            calleeInsta: myInfo.insta || '',
            calleeWhatsapp: myInfo.whatsapp || ''
        });

        setupChat(roomId, callbacks.onMessage);
        
        // Notify UI about partner social info
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

        // Fetch Caller Offer
        const offer = data.offer;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Create Answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } });
        
        // Listen to Caller Candidates
        unsubCallerCandidates = onSnapshot(collection(roomRef, 'callerCandidates'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    let data = change.doc.data();
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data));
                }
            });
        });
        
    } else {
        // Create new room as Caller
        isCaller = true;
        roomRef = doc(collection(db, "chatRooms"));
        roomId = roomRef.id;
        
        // Create Offer
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
        setupChat(roomId, callbacks.onMessage);
        
        let partnerInfoFired = false;
        // Listen for Callee Answer
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
        
        // Listen for Callee Candidates
        unsubCalleeCandidates = onSnapshot(collection(roomRef, 'calleeCandidates'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    let data = change.doc.data();
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data));
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
