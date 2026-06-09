// Wrapper IndexedDB qua idb-keyval (đã load qua <script>, biến global `idbKeyval`).
// Lưu:
//   key "current"  : phiên đang dở (questions + state)
//   key "attempts" : mảng lịch sử các lần nộp bài

const STORE = (typeof idbKeyval !== "undefined")
  ? idbKeyval.createStore("quiz_pwa", "kv")
  : null;

function ensure() {
  if (!STORE) throw new Error("idb-keyval chưa load (vendor/idb-keyval.umd.js).");
}

// ===== Current session =====
export async function saveCurrentSession(payload, key = "current") {
  ensure();
  return idbKeyval.set(key, payload, STORE);
}
export async function loadCurrentSession(key = "current") {
  ensure();
  return (await idbKeyval.get(key, STORE)) || null;
}
export async function clearCurrentSession(key = "current") {
  ensure();
  return idbKeyval.del(key, STORE);
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
 *   wrongQuestions: { id:number, question:string, picked:string|null, correct:string }[],
 * }} attempt
 */
export async function saveAttempt(attempt) {
  ensure();
  const list = (await idbKeyval.get("attempts", STORE)) || [];
  list.push(attempt);
  // Giới hạn để tránh phình to: giữ 200 lần gần nhất.
  if (list.length > 200) list.splice(0, list.length - 200);
  return idbKeyval.set("attempts", list, STORE);
}
export async function getAllAttempts() {
  ensure();
  return (await idbKeyval.get("attempts", STORE)) || [];
}
export async function clearAttempts() {
  ensure();
  return idbKeyval.del("attempts", STORE);
}
