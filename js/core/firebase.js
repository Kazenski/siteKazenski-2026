import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    authDomain: "kazenski-a1bb2.firebaseapp.com",
    projectId: "kazenski-a1bb2",
    storageBucket: "kazenski-a1bb2.firebasestorage.app",
    messagingSenderId: "986432086342",
    appId: "1:986432086342:web:a1cacfa3aad260f3388547"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };
