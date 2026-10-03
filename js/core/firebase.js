import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDLvrHJrPvmqR5PTbn4B9FZO2nIt0iTTU0",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "kazenski-a1bb2.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "kazenski-a1bb2",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "kazenski-a1bb2.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "986432086342",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:986432086342:web:a1cacfa3aad260f3388547"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const rtdb = getDatabase(app);

export { app, db, storage, auth, rtdb };
