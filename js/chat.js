import { db, auth } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let unsubChat = null;
let currentRoomId = null;

export function setupChat(roomId, onMessageCallback) {
    if (unsubChat) {
        unsubChat();
    }
    currentRoomId = roomId;

    const messagesRef = collection(db, "chatRooms", roomId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    unsubChat = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const msg = change.doc.data();
                onMessageCallback({
                    text: msg.text,
                    senderId: msg.senderId,
                    isMe: auth.currentUser && msg.senderId === auth.currentUser.uid
                });
            }
        });
    });
}

export async function sendChatMessage(text) {
    if (!currentRoomId || !auth.currentUser) return;
    
    const messagesRef = collection(db, "chatRooms", currentRoomId, "messages");
    await addDoc(messagesRef, {
        text: text,
        senderId: auth.currentUser.uid,
        timestamp: Date.now()
    });
}

export function stopChat() {
    if (unsubChat) {
        unsubChat();
        unsubChat = null;
    }
    currentRoomId = null;
}
