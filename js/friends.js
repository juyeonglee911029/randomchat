import { db, auth } from './firebase-config.js';
import { 
    doc, getDoc, setDoc, deleteDoc, updateDoc, collection, 
    onSnapshot, query, orderBy, where, serverTimestamp, writeBatch,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/**
 * Search for a user by their Instagram ID
 * @param {string} instaId 
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
 * @param {string} uid 
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
 * Add a friend (Mutual)
 * @param {Object} friendInfo { id, name, photoURL }
 */
export async function addFriend(friendInfo) {
    if (!auth.currentUser || !friendInfo.id) return;
    const myId = auth.currentUser.uid;
    const friendId = friendInfo.id;

    if (myId === friendId) {
        alert("You cannot add yourself as a friend.");
        return;
    }

    const batch = writeBatch(db);
    
    try {
        // Add to my friends
        const myFriendRef = doc(db, 'users', myId, 'friends', friendId);
        batch.set(myFriendRef, {
            id: friendId,
            name: friendInfo.name || 'Anonymous',
            photoURL: friendInfo.photoURL || '',
            addedAt: Date.now()
        });

        // Add me to friend's friends
        const friendMeRef = doc(db, 'users', friendId, 'friends', myId);
        batch.set(friendMeRef, {
            id: myId,
            name: auth.currentUser.displayName || 'Friend',
            photoURL: auth.currentUser.photoURL || '',
            addedAt: Date.now()
        });

        await batch.commit();
        alert("Friend added!");
    } catch (error) {
        console.error("Error adding friend:", error);
        alert("Failed to add friend.");
    }
}

/**
 * Remove a friend
 * @param {string} friendId 
 */
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

/**
 * Listen to friend list changes
 * @param {Function} callback 
 */
export function listenToFriends(callback) {
    if (!auth.currentUser) return () => {};
    const friendsRef = collection(db, 'users', auth.currentUser.uid, 'friends');
    return onSnapshot(friendsRef, async (snapshot) => {
        const friends = [];
        for (const fDoc of snapshot.docs) {
            const fData = fDoc.data();
            // Get latest online status
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
