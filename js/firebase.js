// Firebase: Auth + Firestore — Quiz PWA
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signInWithPopup, GoogleAuthProvider, signOut, updateProfile,
    sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
    collection, getDocs, query, orderBy, limit,
    serverTimestamp, Timestamp,
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

// ================================================================
//  AUTH
// ================================================================
export async function registerWithEmail(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await initUserDoc(cred.user);
    return cred.user;
}

export async function loginWithEmail(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await checkBanned(cred.user);
    await initUserDoc(cred.user);
    return cred.user;
}

export async function loginWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider);
    await checkBanned(cred.user);
    await initUserDoc(cred.user);
    return cred.user;
}

async function checkBanned(user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists() && snap.data().banned) {
        await signOut(auth);
        throw { code: "auth/user-banned", message: "Tài khoản của bạn đã bị chặn." };
    }
}

export function logout() { return signOut(auth); }
export function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }
export function resetPasswordEmail(email) { return sendPasswordResetEmail(auth, email); }

// ================================================================
//  USER DOC  (users/{uid})
// ================================================================
async function initUserDoc(user) {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        await setDoc(ref, {
            displayName: user.displayName || "",
            email: user.email || "",
            role: "user",          // "user" | "admin"
            createdAt: serverTimestamp(),
            wrongQuestions: [],
            attempts: [],
        });
    }
}

export async function getUserProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function isAdmin(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() && snap.data().role === "admin";
}

// ================================================================
//  WRONG QUESTIONS  (per user)
// ================================================================
export async function cloudSaveWrongQuestions(uid, newItems) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data().wrongQuestions || []) : [];
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

// ================================================================
//  ATTEMPTS / HISTORY  (per user)
// ================================================================
export async function cloudSaveAttempt(uid, attempt) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data().attempts || []) : [];
    const updated = [...existing, attempt].slice(-200);
    await updateDoc(ref, { attempts: updated });
}

export async function cloudGetAttempts(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? (snap.data().attempts || []) : [];
}

// ================================================================
//  DOCUMENTS / TÀI LIỆU  (documents/{code})
//  Admin upload Excel → lưu câu hỏi lên Firestore kèm mã 6 ký tự
//  User nhập mã → tải về câu hỏi
// ================================================================

/** Sinh mã 6 ký tự in hoa ngẫu nhiên */
function genCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bỏ O,0,1,I tránh nhầm
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

/**
 * Admin lưu tài liệu lên Firestore.
 * @param {{ title:string, questions:any[], sheetName:string }} data
 * @param {string} createdByUid
 * @returns {string} code
 */
export async function uploadDocument(data, createdByUid) {
    let code, exists;
    do {
        code = genCode();
        exists = (await getDoc(doc(db, "documents", code))).exists();
    } while (exists);

    // Deep-clean: JSON round-trip loại bỏ tất cả undefined, function, Symbol
    const cleanQuestions = JSON.parse(JSON.stringify(
        data.questions.map((q) => ({
            id: q.id ?? 0,
            question: String(q.question ?? ""),
            options: (q.options ?? []).map((o) => String(o ?? "")),
            correctIndex: Number(q.correctIndex ?? 0),
            ...(q.topic != null && q.topic !== undefined ? { topic: String(q.topic) } : {}),
            ...(q.image != null && q.image !== undefined ? { image: String(q.image) } : {}),
        }))
    ));

    await setDoc(doc(db, "documents", code), {
        title: String(data.title || data.sheetName || "Tài liệu"),
        sheetName: String(data.sheetName || ""),
        questions: cleanQuestions,
        createdBy: String(createdByUid),
        createdAt: serverTimestamp(),
        usageCount: 0,
    });
    return code;
}

/**
 * User nhập mã → lấy câu hỏi
 * @param {string} code
 * @returns {{ title:string, sheetName:string, questions:any[] } | null}
 */
export async function getDocumentByCode(code) {
    const snap = await getDoc(doc(db, "documents", code.toUpperCase()));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.disabled) return { disabled: true, title: data.title };
    updateDoc(snap.ref, { usageCount: (data.usageCount || 0) + 1 }).catch(() => { });
    return { code, ...data };
}

// ================================================================
//  ADMIN FUNCTIONS
// ================================================================

/** Lấy tất cả users */
export async function adminGetAllUsers() {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/** Đổi role user */
export async function adminSetRole(uid, role) {
    await updateDoc(doc(db, "users", uid), { role });
}

/** Chặn/bỏ chặn user */
export async function adminToggleBan(uid, banned) {
    await updateDoc(doc(db, "users", uid), { banned });
}

/** Tắt/bật tài liệu */
export async function adminToggleDocument(code, disabled) {
    await updateDoc(doc(db, "documents", code), { disabled });
}

/** Lấy tất cả documents */
export async function adminGetAllDocuments() {
    const snap = await getDocs(collection(db, "documents"));
    return snap.docs.map((d) => ({ code: d.id, ...d.data() }));
}

/** Xóa document */
export async function adminDeleteDocument(code) {
    await deleteDoc(doc(db, "documents", code));
}

/** Cập nhật tiêu đề document */
export async function adminUpdateDocumentTitle(code, title) {
    await updateDoc(doc(db, "documents", code), { title });
}

// ================================================================
//  USER UPLOADS  (userUploads/{id})
//  User tải file Excel → parse → lưu metadata + questions lên đây
//  Admin xem và có thể chuyển thành tài liệu chính thức
// ================================================================

/** User lưu file đã parse lên cloud */
export async function saveUserUpload(uid, data) {
    const id = `${uid}_${Date.now()}`;
    const cleanQuestions = JSON.parse(JSON.stringify(
        data.questions.map((q) => ({
            id: q.id ?? 0,
            question: String(q.question ?? ""),
            options: (q.options ?? []).map((o) => String(o ?? "")),
            correctIndex: Number(q.correctIndex ?? 0),
            ...(q.topic ? { topic: String(q.topic) } : {}),
        }))
    ));
    await setDoc(doc(db, "userUploads", id), {
        uid,
        displayName: data.displayName || "",
        email: data.email || "",
        fileName: String(data.fileName || ""),
        sheetName: String(data.sheetName || ""),
        questionCount: cleanQuestions.length,
        questions: cleanQuestions,
        uploadedAt: serverTimestamp(),
        status: "pending", // "pending" | "converted"
        convertedCode: null,
    });
    return id;
}

/** Admin lấy tất cả user uploads */
export async function adminGetAllUserUploads() {
    const snap = await getDocs(collection(db, "userUploads"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0));
}

/** Admin chuyển user upload thành tài liệu chính thức */
export async function adminConvertUpload(uploadId, title, createdByUid) {
    const snap = await getDoc(doc(db, "userUploads", uploadId));
    if (!snap.exists()) throw new Error("Upload không tồn tại.");
    const data = snap.data();
    const code = await uploadDocument({ title, sheetName: data.sheetName, questions: data.questions }, createdByUid);
    await updateDoc(doc(db, "userUploads", uploadId), { status: "converted", convertedCode: code });
    return code;
}

/** Admin xóa user upload */
export async function adminDeleteUserUpload(id) {
    await deleteDoc(doc(db, "userUploads", id));
}

// ================================================================
//  RATE LIMITING — chống spam/tấn công
//  Lưu số lần request vào Firestore theo uid + window 1 phút
// ================================================================
const RATE_LIMITS = {
    loadDocument: { max: 20, windowMs: 60000 },  // 20 lần/phút
    submitAttempt: { max: 30, windowMs: 60000 },  // 30 lần/phút
};

const _rateLimitCache = new Map(); // uid_action -> { count, resetAt }

/**
 * Kiểm tra rate limit phía client (không thay thế server-side)
 * @returns {boolean} true = OK, false = bị chặn
 */
export function checkRateLimit(uid, action) {
    if (!uid) return true;
    const key = `${uid}_${action}`;
    const limit = RATE_LIMITS[action];
    if (!limit) return true;

    const now = Date.now();
    const entry = _rateLimitCache.get(key);

    if (!entry || now > entry.resetAt) {
        _rateLimitCache.set(key, { count: 1, resetAt: now + limit.windowMs });
        return true;
    }

    if (entry.count >= limit.max) {
        return false; // bị chặn
    }

    entry.count++;
    return true;
}

/** Admin lấy settings hệ thống (maintenance mode, etc.) */
export async function getSystemSettings() {
    const snap = await getDoc(doc(db, "system", "settings"));
    return snap.exists() ? snap.data() : { maintenanceMode: false, maxUsersPerDay: 1000 };
}

/** Admin cập nhật settings hệ thống */
export async function adminUpdateSystemSettings(settings) {
    await setDoc(doc(db, "system", "settings"), settings, { merge: true });
}
