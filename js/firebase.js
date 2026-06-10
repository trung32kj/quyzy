// Firebase: Auth + Firestore
// Dùng CDN module (không cần build tool)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    arrayUnion,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCEorEAh4MN8x8DFc6lFZyzYRKkU-WPHO0",
    authDomain: "quiz-pwa-85226.firebaseapp.com",
    projectId: "quiz-pwa-85226",
    storageBucket: "quiz-pwa-85226.firebasestorage.app",
    messagingSenderId: "757325441498",
    appId: "1:757325441498:web:3e8a1aaf8ada21495bf8e3",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ===== Auth =====

export async function registerWithEmail(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await initUserDoc(cred.user);
    return cred.user;
}

export async function loginWithEmail(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await initUserDoc(cred.user);
    return cred.user;
}

export async function loginWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider);
    await initUserDoc(cred.user);
    return cred.user;
}

export async function logout() {
    return signOut(auth);
}

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

// ===== Firestore user doc =====

async function initUserDoc(user) {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        await setDoc(ref, {
            displayName: user.displayName || "",
            email: user.email || "",
            createdAt: serverTimestamp(),
            wrongQuestions: [],
            attempts: [],
        });
    }
}

// ===== Cloud: Wrong Questions =====

export async function cloudSaveWrongQuestions(uid, newItems) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data().wrongQuestions || []) : [];
    // Deduplicate theo question text
    const map = new Map(existing.map((q) => [q.question, q]));
    for (const item of newItems) map.set(item.question, item);
    await updateDoc(ref, { wrongQuestions: [...map.values()] });
}

export async function cloudGetWrongQuestions(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? (snap.data().wrongQuestions || []) : [];
}

export async function cloudClearWrongQuestions(uid) {
    await updateDoc(doc(db, "users", uid), { wrongQuestions: [] });
}

// ===== Cloud: Attempts (lịch sử) =====

export async function cloudSaveAttempt(uid, attempt) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data().attempts || []) : [];
    const updated = [...existing, attempt].slice(-200); // giữ 200 gần nhất
    await updateDoc(ref, { attempts: updated });
}

export async function cloudGetAttempts(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? (snap.data().attempts || []) : [];
}
