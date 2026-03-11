import { db, auth } from './firebase-config.js';
import { 
    doc, getDoc, setDoc, deleteDoc, updateDoc, collection, 
    onSnapshot, query, orderBy, where, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/**
 * Search for a user by their UID (ID)
 * @param {string} userId 
 */
export async function searchUserById(userId) {
    if (!userId) return null;
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            return { id: userSnap.id, ...userSnap.data() };
        }
    } catch (error) {
        console.error("Error searching user:", error);
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

    try {
        // Get my current info for the friend's record
        const mySnap = await getDoc(doc(db, 'users', myId));
        const myData = mySnap.data();

        const batch = writeBatch(db);

        // Add friend to my list
        const myFriendRef = doc(db, 'users', myId, 'friends', friendId);
        batch.set(myFriendRef, {
            friendId: friendId,
            name: friendInfo.name || 'Anonymous',
            photoURL: friendInfo.photoURL || '',
            addedAt: Date.now()
        });

        // Add me to friend's list
        const friendMeRef = doc(db, 'users', friendId, 'friends', myId);
        batch.set(friendMeRef, {
            friendId: myId,
            name: auth.currentUser.displayName || myData.name || 'Anonymous',
            photoURL: auth.currentUser.photoURL || myData.photoURL || '',
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
 * Remove a friend (Mutual removal)
 * @param {string} friendId 
 */
export async function removeFriend(friendId) {
    if (!auth.currentUser || !friendId) return;
    const myId = auth.currentUser.uid;

    try {
        const batch = writeBatch(db);

        // Remove from my list
        batch.delete(doc(db, 'users', myId, 'friends', friendId));
        // Remove from friend's list
        batch.delete(doc(db, 'users', friendId, 'friends', myId));

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
    const q = query(friendsRef, orderBy('addedAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
        const friends = [];
        snapshot.forEach(doc => {
            friends.push({ id: doc.id, ...doc.data() });
        });
        callback(friends);
    });
}
