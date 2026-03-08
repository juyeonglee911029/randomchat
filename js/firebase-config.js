import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyApH0U10lGxtcdtQ7fNSYJ7Iz4F5lRfpPA",
    authDomain: "pupu-tetris.firebaseapp.com",
    databaseURL: "https://pupu-tetris-default-rtdb.firebaseio.com",
    projectId: "pupu-tetris",
    storageBucket: "pupu-tetris.firebasestorage.app",
    messagingSenderId: "357553125670",
    appId: "1:357553125670:web:e4a7ff58c177fe3fe7a9e7",
    measurementId: "G-SPG68G1FLZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { app, db, auth, provider };
