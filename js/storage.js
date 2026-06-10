// Wrapper IndexedDB qua idb-keyval (đã load qua <script>, biến global `idbKeyval`).
// Lưu:
//   key "current"  : phiên đang dở (questions + state)
//   key "attempts" : mảng lịch sử các lần nộp bài
//   key "currentUser" : username đang đăng nhập

const STORE = (typeof idbKeyval !== "undefined")
  ? idbKeyval.createStore("quiz_pwa", "kv")
  : null;

function ensure() {
  if (!STORE) throw new Error("idb-keyval chưa load (vendor/idb-keyval.umd.js).");
}

// ===== User Management =====
export async function getCurrentUser() {
  ensure();
  return (await idbKeyval.get("currentUser", STORE)) || null;
}

export async function setCurrentUser(username) {
  ensure();
  return idbKeyval.set("currentUser", username, STORE);
}

export async function clearCurrentUser() {
  ensure();
  return idbKeyval.del("currentUser", STORE);
}

// Helper: tạo key theo user
function getUserKey(baseKey, username) {
  return username ? `${username}_${baseKey}` : baseKey;
}

// ===== Current session =====
export async function saveCurrentSession(payload, key = "current") {
  ensure();
  const username = await getCurrentUser();
  const userKey = getUserKey(key, username);
  return idbKeyval.set(userKey, payload, STORE);
}
export async function loadCurrentSession(key = "current") {
  ensure();
  const username = await getCurrentUser();
  const userKey = getUserKey(key, username);
  return (await idbKeyval.get(userKey, STORE)) || null;
}
export async function clearCurrentSession(key = "current") {
  ensure();
  const username = await getCurrentUser();
  const userKey = getUserKey(key, username);
  return idbKeyval.del(userKey, STORE);
}

// ===== Attempt history =====
/**
 * Lưu summary 1 lần nộp bài.
 * @param {{
 *   timestamp: string,
 *   sheetName: string,
 *   roundIndex: number,
 *   correct: number,
 *   total: number,
 *   unanswered: number,
 *   wrongQuestions: { id:number, question:string, options:string[], correctIndex:number, picked:number|null }[],
 * }} attempt
 */
export async function saveAttempt(attempt) {
  ensure();
  const username = await getCurrentUser();
  const key = getUserKey("attempts", username);
  const list = (await idbKeyval.get(key, STORE)) || [];
  list.push(attempt);
  // Giới hạn để tránh phình to: giữ 200 lần gần nhất.
  if (list.length > 200) list.splice(0, list.length - 200);
  return idbKeyval.set(key, list, STORE);
}
export async function getAllAttempts() {
  ensure();
  const username = await getCurrentUser();
  const key = getUserKey("attempts", username);
  return (await idbKeyval.get(key, STORE)) || [];
}
export async function clearAttempts() {
  ensure();
  const username = await getCurrentUser();
  const key = getUserKey("attempts", username);
  return idbKeyval.del(key, STORE);
}

// ===== Wrong Questions (cho tab Ôn tập) =====
/**
 * Lưu danh sách câu sai, deduplicate theo id+question.
 * Mỗi câu lưu đủ thông tin để ôn tập: options, correctIndex.
 * @param {{ id:number, question:string, options:string[], correctIndex:number, picked:number|null }[]} newItems
 */
export async function saveWrongQuestions(newItems) {
  ensure();
  const username = await getCurrentUser();
  const key = getUserKey("wrongQuestions", username);
  const existing = (await idbKeyval.get(key, STORE)) || [];
  // Deduplicate: dùng question text làm key
  const map = new Map(existing.map((q) => [q.question, q]));
  for (const item of newItems) {
    map.set(item.question, item);
  }
  return idbKeyval.set(key, [...map.values()], STORE);
}

export async function getWrongQuestions() {
  ensure();
  const username = await getCurrentUser();
  const key = getUserKey("wrongQuestions", username);
  return (await idbKeyval.get(key, STORE)) || [];
}

export async function clearWrongQuestions() {
  ensure();
  const username = await getCurrentUser();
  const key = getUserKey("wrongQuestions", username);
  return idbKeyval.del(key, STORE);
}
