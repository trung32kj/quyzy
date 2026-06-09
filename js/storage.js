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
 *   wrongQuestions: { id:number, question:string, options:string[], correctIndex:number, picked:number|null }[],
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

// ===== Wrong Questions (cho tab Ôn tập) =====
/**
 * Lưu danh sách câu sai, deduplicate theo id+question.
 * Mỗi câu lưu đủ thông tin để ôn tập: options, correctIndex.
 * @param {{ id:number, question:string, options:string[], correctIndex:number, picked:number|null }[]} newItems
 */
export async function saveWrongQuestions(newItems) {
  ensure();
  const existing = (await idbKeyval.get("wrongQuestions", STORE)) || [];
  // Deduplicate: dùng question text làm key
  const map = new Map(existing.map((q) => [q.question, q]));
  for (const item of newItems) {
    map.set(item.question, item);
  }
  return idbKeyval.set("wrongQuestions", [...map.values()], STORE);
}

export async function getWrongQuestions() {
  ensure();
  return (await idbKeyval.get("wrongQuestions", STORE)) || [];
}

export async function clearWrongQuestions() {
  ensure();
  return idbKeyval.del("wrongQuestions", STORE);
}
