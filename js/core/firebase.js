import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const getEnv = (key) => {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
            return import.meta.env[key];
        }
    } catch (e) {
        // ignore
    }
    return undefined;
};

const firebaseConfig = {
    apiKey: getEnv('VITE_FIREBASE_API_KEY') || "__VITE_FIREBASE_API_KEY__",
    authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || "__VITE_FIREBASE_AUTH_DOMAIN__",
    projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || "__VITE_FIREBASE_PROJECT_ID__",
    storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || "__VITE_FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
    appId: getEnv('VITE_FIREBASE_APP_ID') || "__VITE_FIREBASE_APP_ID__"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const rtdb = getDatabase(app);

export { app, db, storage, auth, rtdb };
