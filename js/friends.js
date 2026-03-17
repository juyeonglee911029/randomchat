import { db, auth } from './firebase-config.js';
import { 
    doc, getDoc, setDoc, deleteDoc, updateDoc, collection, 
    onSnapshot, query, orderBy, where, serverTimestamp, writeBatch,
    getDocs, limit, addDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/**
 * Search for a user by their Instagram ID
 */
export async function searchUserByInstaId(instaId) {
    if (!instaId) return null;
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('insta', '==', instaId), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    }
    return null;
}

/**
 * Search for a user by their Firebase UID
 */
export async function searchUserById(uid) {
    if (!uid) return null;
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
        return { id: userSnap.id, ...userSnap.data() };
    }
    return null;
}

/**
 * Send a friend request
 */
export async function sendFriendRequest(friendInfo) {
    if (!auth.currentUser || !friendInfo.id) return;
    const myId = auth.currentUser.uid;
    const friendId = friendInfo.id;

    if (myId === friendId) {
        alert("You cannot add yourself.");
        return;
    }

    // Check if already friends
    const friendRef = doc(db, 'users', myId, 'friends', friendId);
    const friendSnap = await getDoc(friendRef);
    if (friendSnap.exists()) {
        alert("Already friends!");
        return;
    }

    // Check if request already sent
    const requestsRef = collection(db, 'friendRequests');
    const q = query(requestsRef, 
        where('fromId', '==', myId), 
        where('toId', '==', friendId),
        where('status', '==', 'pending')
    );
    const requestSnap = await getDocs(q);
    if (!requestSnap.empty) {
        alert("Request already sent!");
        return;
    }

    try {
        await addDoc(requestsRef, {
            fromId: myId,
            fromName: auth.currentUser.displayName || 'Anonymous',
            fromPhoto: auth.currentUser.photoURL || '',
            toId: friendId,
            status: 'pending',
            timestamp: serverTimestamp()
        });
        alert("Friend request sent!");
    } catch (error) {
        console.error("Error sending friend request:", error);
        alert("Failed to send request.");
    }
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(request) {
    if (!auth.currentUser) return;
    const myId = auth.currentUser.uid;
    const batch = writeBatch(db);

    try {
        // Add to my friends
        const myFriendRef = doc(db, 'users', myId, 'friends', request.fromId);
        batch.set(myFriendRef, {
            id: request.fromId,
            name: request.fromName,
            photoURL: request.fromPhoto,
            addedAt: Date.now()
        });

        // Add me to friend's friends
        const friendMeRef = doc(db, 'users', request.fromId, 'friends', myId);
        batch.set(friendMeRef, {
            id: myId,
            name: auth.currentUser.displayName || 'Friend',
            photoURL: auth.currentUser.photoURL || '',
            addedAt: Date.now()
        });

        // Update request status
        const requestRef = doc(db, 'friendRequests', request.id);
        batch.delete(requestRef);

        await batch.commit();
        alert("Friend request accepted!");
    } catch (error) {
        console.error("Error accepting request:", error);
    }
}

/**
 * Decline a friend request
 */
export async function declineFriendRequest(requestId) {
    try {
        await deleteDoc(doc(db, 'friendRequests', requestId));
        alert("Request declined.");
    } catch (error) {
        console.error("Error declining request:", error);
    }
}

/**
 * Listen to incoming friend requests
 */
export function listenToFriendRequests(callback) {
    if (!auth.currentUser) return () => {};
    const requestsRef = collection(db, 'friendRequests');
    const q = query(requestsRef, 
        where('toId', '==', auth.currentUser.uid), 
        where('status', '==', 'pending')
    );
    return onSnapshot(q, (snapshot) => {
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(requests);
    });
}

/**
 * Listen to friend list changes
 */
export function listenToFriends(callback) {
    if (!auth.currentUser) return () => {};
    const friendsRef = collection(db, 'users', auth.currentUser.uid, 'friends');
    return onSnapshot(friendsRef, async (snapshot) => {
        const friends = [];
        for (const fDoc of snapshot.docs) {
            const fData = fDoc.data();
            const uSnap = await getDoc(doc(db, 'users', fDoc.id));
            if (uSnap.exists()) {
                friends.push({ ...fData, ...uSnap.data(), id: fDoc.id });
            } else {
                friends.push({ ...fData, id: fDoc.id });
            }
        }
        callback(friends);
    });
}

/**
 * Signal a call to a friend
 */
export async function initiateDirectCall(friendId, password = '') {
    if (!auth.currentUser) return null;
    const myId = auth.currentUser.uid;
    const roomId = [myId, friendId].sort().join('_');
    
    const callRef = doc(db, 'calls', friendId);
    await setDoc(callRef, {
        callerId: myId,
        callerName: auth.currentUser.displayName || 'Friend',
        roomId: roomId,
        password: password,
        timestamp: Date.now()
    });
    
    return roomId;
}

/**
 * Listen for incoming calls
 */
export function listenForCalls(onCall) {
    if (!auth.currentUser) return () => {};
    const callRef = doc(db, 'calls', auth.currentUser.uid);
    return onSnapshot(callRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            if (Date.now() - data.timestamp < 30000) {
                onCall(data);
                deleteDoc(callRef).catch(() => {});
            }
        }
    });
}

export async function removeFriend(friendId) {
    if (!auth.currentUser || !friendId) return;
    const myId = auth.currentUser.uid;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', myId, 'friends', friendId));
    batch.delete(doc(db, 'users', friendId, 'friends', myId));
    try {
        await batch.commit();
        alert("Friend removed.");
    } catch (error) {
        console.error("Error removing friend:", error);
    }
}
