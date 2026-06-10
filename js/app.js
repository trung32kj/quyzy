// Bootstrap UI — Quiz PWA với Firebase Auth + Firestore sync

import { readWorkbook, parseSheet } from "./parser.js";
import { createState, recordAnswer, roundResult, nextRound as nextRoundFn } from "./quiz.js";
import {
  saveCurrentSession, loadCurrentSession, clearCurrentSession,
  saveAttempt, saveWrongQuestions, getWrongQuestions, clearWrongQuestions,
} from "./storage.js";
import {
  onAuthChange, registerWithEmail, loginWithEmail, loginWithGoogle, logout,
  getUserProfile, isAdmin,
  cloudSaveWrongQuestions, cloudGetWrongQuestions, cloudClearWrongQuestions,
  cloudSaveAttempt, cloudGetAttempts,
  getDocumentByCode, saveUserUpload,
} from "./firebase.js";

const $ = (id) => document.getElementById(id);

// ================================================================
//  AUTH STATE
// ================================================================
let currentUser = null;
let currentUserProfile = null;

onAuthChange(async (user) => {
  currentUser = user;
  if (user) {
    currentUserProfile = await getUserProfile(user.uid).catch(() => null);
    $("userInfo").style.display = "flex";
    $("authBtn").style.display = "none";
    $("currentUserDisplay").textContent = user.displayName || user.email.split("@")[0];

    // Hiện link Admin nếu là admin
    const adminLink = $("adminLink");
    if (adminLink) {
      adminLink.style.display = (currentUserProfile?.role === "admin") ? "inline-flex" : "none";
    }

    // Hiện nội dung app, ẩn màn hình chặn
    $("loginWall").style.display = "none";
    $("appContent").style.display = "block";

    closeAuthModal();
    await syncFromCloud();
    initResume();
  } else {
    currentUser = null; currentUserProfile = null;
    $("userInfo").style.display = "none";
    $("authBtn").style.display = "inline-flex";
    const adminLink = $("adminLink");
    if (adminLink) adminLink.style.display = "none";

    // Ẩn nội dung, hiện màn hình yêu cầu đăng nhập
    $("loginWall").style.display = "flex";
    $("appContent").style.display = "none";

    // Reset state
    state = null; questions = []; workbook = null;
    examState = null; examQuestions = []; examWorkbook = null;
  }
});

/** Sync câu sai + lịch sử từ cloud về local khi đăng nhập */
async function syncFromCloud() {
  if (!currentUser) return;
  try {
    const wrong = await cloudGetWrongQuestions(currentUser.uid);
    if (wrong.length) await saveWrongQuestions(wrong).catch(() => { });
  } catch (e) { console.warn("sync wrong:", e); }
}

// ================================================================
//  QUIZ STATE
// ================================================================
let workbook = null;
let questions = [];
let state = null;
let currentSheetName = "";
let currentFileName = "";

let examWorkbook = null;
let examQuestions = [];
let examState = null;
let examTimerInterval = null;
let examTimeRemaining = 0;

// ================================================================
//  HELPERS
// ================================================================
async function persistWrongQuestions(items) {
  await saveWrongQuestions(items).catch((e) => console.warn("local wrong:", e));
  if (currentUser) {
    await cloudSaveWrongQuestions(currentUser.uid, items).catch((e) => console.warn("cloud wrong:", e));
  }
}

async function persistAttempt(attempt) {
  await saveAttempt(attempt).catch((e) => console.warn("local attempt:", e));
  if (currentUser) {
    await cloudSaveAttempt(currentUser.uid, attempt).catch((e) => console.warn("cloud attempt:", e));
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (state && questions.length) {
      saveCurrentSession({ sheetName: currentSheetName, questions, state, savedAt: new Date().toISOString() })
        .catch(() => { });
    }
  }, 300);
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleString("vi-VN"); } catch { return iso || "?"; }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function populateSelect(sel, names, defaultName) {
  sel.innerHTML = "";
  names.forEach((n) => {
    const o = document.createElement("option");
    o.value = o.textContent = n;
    if (n === defaultName) o.selected = true;
    sel.appendChild(o);
  });
}

// ================================================================
//  SERVICE WORKER
// ================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((r) => console.log("SW:", r.scope))
      .catch((e) => console.warn("SW:", e));
  });
}

// ================================================================
//  THEME
// ================================================================
(function initTheme() {
  const t = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(t);
  $("themeBtn").addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });
})();

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  $("iconSun").style.display = t === "dark" ? "none" : "block";
  $("iconMoon").style.display = t === "dark" ? "block" : "none";
  try { localStorage.setItem("theme", t); } catch { }
}

window.addEventListener("scroll", () => {
  document.querySelector(".topbar")?.classList.toggle("scrolled", window.scrollY > 4);
}, { passive: true });

// ================================================================
//  RESUME PHIÊN DỞ
// ================================================================
async function initResume() {
  try {
    const session = await loadCurrentSession();
    if (session?.state && session?.questions) {
      const r = session.state.currentRound + 1;
      $("resumeText").textContent =
        `Phiên đang dở: "${session.sheetName}" — vòng ${r}/${session.state.rounds.length} (lưu lúc ${formatTime(session.savedAt)}).`;
      $("resumeBanner").style.display = "flex";
      $("resumeBtn").onclick = () => {
        questions = session.questions; state = session.state;
        currentSheetName = session.sheetName;
        $("resumeBanner").style.display = "none";
        $("quizArea").style.display = "block";
        loadCurrentRound();
      };
      $("discardBtn").onclick = async () => {
        await clearCurrentSession();
        $("resumeBanner").style.display = "none";
      };
    } else {
      $("resumeBanner").style.display = "none";
    }
  } catch (e) { console.warn("resume:", e); }
}
initResume();

// ================================================================
//  AUTH MODAL
// ================================================================
$("authBtn").addEventListener("click", openAuthModal);
$("loginWallBtn")?.addEventListener("click", openAuthModal);
$("closeAuthModal").addEventListener("click", closeAuthModal);
$("authModal").addEventListener("click", (e) => { if (e.target === $("authModal")) closeAuthModal(); });

// Quên mật khẩu
$("forgotPasswordLink").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  if (!email) {
    $("loginError").textContent = "Nhập email trước rồi bấm Quên mật khẩu.";
    $("loginEmail").focus();
    return;
  }
  try {
    const { resetPasswordEmail } = await import("./firebase.js");
    await resetPasswordEmail(email);
    $("loginError").style.color = "var(--success)";
    $("loginError").textContent = `✅ Đã gửi email đặt lại mật khẩu đến ${email}. Kiểm tra hộp thư!`;
  } catch (err) {
    $("loginError").style.color = "var(--danger)";
    $("loginError").textContent = friendlyAuthError(err.code);
  }
});

function openAuthModal() { $("authModal").style.display = "flex"; }
function closeAuthModal() {
  $("authModal").style.display = "none";
  $("loginError").textContent = "";
  $("registerError").textContent = "";
}

$("tabLoginBtn").addEventListener("click", () => {
  $("formLogin").style.display = "block"; $("formRegister").style.display = "none";
  $("tabLoginBtn").classList.add("active"); $("tabRegisterBtn").classList.remove("active");
});
$("tabRegisterBtn").addEventListener("click", () => {
  $("formLogin").style.display = "none"; $("formRegister").style.display = "block";
  $("tabRegisterBtn").classList.add("active"); $("tabLoginBtn").classList.remove("active");
});

$("loginEmailBtn").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim(), pw = $("loginPassword").value;
  if (!email || !pw) { $("loginError").textContent = "Vui lòng điền đầy đủ."; return; }
  $("loginEmailBtn").disabled = true;
  try { await loginWithEmail(email, pw); }
  catch (e) { $("loginError").textContent = friendlyAuthError(e.code); }
  finally { $("loginEmailBtn").disabled = false; }
});

$("loginGoogleBtn").addEventListener("click", async () => {
  try { await loginWithGoogle(); }
  catch (e) { $("loginError").textContent = friendlyAuthError(e.code); }
});

$("registerBtn").addEventListener("click", async () => {
  const name = $("regName").value.trim(), email = $("regEmail").value.trim(), pw = $("regPassword").value;
  if (!name || !email || !pw) { $("registerError").textContent = "Vui lòng điền đầy đủ."; return; }
  if (pw.length < 6) { $("registerError").textContent = "Mật khẩu tối thiểu 6 ký tự."; return; }
  $("registerBtn").disabled = true;
  try { await registerWithEmail(email, pw, name); }
  catch (e) { $("registerError").textContent = friendlyAuthError(e.code); }
  finally { $("registerBtn").disabled = false; }
});

$("registerGoogleBtn").addEventListener("click", async () => {
  try { await loginWithGoogle(); }
  catch (e) { $("registerError").textContent = friendlyAuthError(e.code); }
});

[$("loginEmail"), $("loginPassword")].forEach((el) =>
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginEmailBtn").click(); })
);
[$("regName"), $("regEmail"), $("regPassword")].forEach((el) =>
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") $("registerBtn").click(); })
);

$("logoutBtn").addEventListener("click", async () => {
  if (confirm("Đăng xuất?")) {
    await logout();
    // Xóa state quiz
    state = null; questions = []; workbook = null;
    $("quizArea").style.display = "none";
    $("status").textContent = "";
  }
});

function friendlyAuthError(code) {
  return ({
    "auth/user-not-found": "Email không tồn tại.",
    "auth/wrong-password": "Sai mật khẩu.",
    "auth/email-already-in-use": "Email đã được dùng.",
    "auth/invalid-email": "Email không hợp lệ.",
    "auth/weak-password": "Mật khẩu quá yếu (tối thiểu 6 ký tự).",
    "auth/popup-closed-by-user": "Đã đóng cửa sổ đăng nhập.",
    "auth/network-request-failed": "Lỗi mạng, thử lại.",
    "auth/invalid-credential": "Sai email hoặc mật khẩu.",
  })[code] || ("Lỗi: " + code);
}

// ================================================================
//  TAB NAVIGATION
// ================================================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabId = btn.getAttribute("data-tab");
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    $(`tab-${tabId}`).classList.add("active");
    if (tabId === "review") loadReviewData();
    if (tabId === "history") loadHistoryData();
  });
});

// ================================================================
//  MÃ TÀI LIỆU — nhập mã để tải câu hỏi
// ================================================================
$("loadCodeBtn").addEventListener("click", loadByCode);
$("docCodeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") loadByCode(); });

async function loadByCode() {
  const code = $("docCodeInput").value.trim().toUpperCase();
  if (!code) { $("codeStatus").textContent = "Vui lòng nhập mã."; return; }
  $("codeStatus").textContent = "Đang tải...";
  $("loadCodeBtn").disabled = true;
  try {
    const docData = await getDocumentByCode(code);
    if (!docData) { $("codeStatus").textContent = `❌ Không tìm thấy mã "${code}".`; return; }
    questions = docData.questions;
    currentSheetName = docData.title || docData.sheetName || code;
    $("codeStatus").textContent = `✅ "${currentSheetName}" — ${questions.length} câu hỏi.`;
    // Highlight cột mã, tắt highlight cột file
    $("colCode").classList.add("active");
    $("colFile").classList.remove("active");
    $("startSettings").style.display = "block";
    $("docCodeInput").value = "";
  } catch (e) {
    $("codeStatus").textContent = "Lỗi: " + e.message;
  } finally {
    $("loadCodeBtn").disabled = false;
  }
}

// startFromCodeBtn đã được gộp vào startBtn chung

// ================================================================
//  TAB HỌC
// ================================================================
$("upload").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  currentFileName = file.name;
  $("status").textContent = `Đang đọc ${file.name}...`;
  try {
    const info = readWorkbook(await file.arrayBuffer());
    workbook = info.workbook;
    populateSelect($("sheetSelect"), info.sheetNames, info.answerSheet);
    $("sheetSelector").style.display = "block";
    $("status").textContent = `Đã đọc ${info.sheetNames.length} sheet.` +
      (info.answerSheet ? ` Gợi ý: "${info.answerSheet}".` : "");
    // Highlight cột file, tắt highlight cột mã
    $("colFile").classList.add("active");
    $("colCode").classList.remove("active");
    $("codeStatus").textContent = "";
  } catch (err) { $("status").textContent = "Lỗi: " + err.message; }
});

$("loadSheetBtn").addEventListener("click", () => {
  try {
    const result = parseSheet(workbook, $("sheetSelect").value);
    questions = result.questions; currentSheetName = $("sheetSelect").value;
    if (!questions.length) { $("status").textContent = "Không có câu hỏi hợp lệ."; return; }
    $("status").textContent = `✅ ${questions.length} câu hỏi (Schema ${result.schema})` +
      (result.skipped ? ` — bỏ ${result.skipped} dòng lỗi` : "");
    $("startSettings").style.display = "block";
    // Lưu lên cloud để admin xem
    if (currentUser) {
      saveUserUpload(currentUser.uid, {
        displayName: currentUser.displayName || "",
        email: currentUser.email || "",
        fileName: currentFileName || "",
        sheetName: currentSheetName,
        questions,
      }).catch((e) => console.warn("saveUserUpload:", e));
    }
  } catch (err) { $("status").textContent = "Lỗi: " + err.message; }
});

$("startBtn").addEventListener("click", () => {
  if (!questions.length) return;
  state = createState(questions, parseInt($("numPerRound").value, 10));
  $("startSettings").style.display = "none";
  $("colCode").classList.remove("active");
  $("colFile").classList.remove("active");
  $("quizArea").style.display = "block";
  loadCurrentRound();
  window.scrollTo({ top: 0, behavior: "smooth" });
  scheduleSave();
});

function loadCurrentRound() {
  $("roundInfo").textContent = `Vòng ${state.currentRound + 1}/${state.rounds.length}`;
  renderRound();
  const done = state.submitted[state.currentRound];
  const last = state.currentRound >= state.rounds.length - 1;
  $("submitBtn").style.display = "none";
  $("nextBtn").style.display = (done && !last) ? "inline-block" : "none";
  $("result").textContent = done ? `🎯 Vòng ${state.currentRound + 1}: đúng ${roundResult(state).correct}/${roundResult(state).total}` : "";
}

function renderRound() {
  const round = state.rounds[state.currentRound];
  const submitted = state.submitted[state.currentRound];
  $("quiz").innerHTML = ""; $("progress").innerHTML = "";
  round.forEach((item, qi) => {
    const box = document.createElement("div");
    box.className = "question"; box.id = `qbox${qi}`;
    box.innerHTML = `<h3>Câu ${qi + 1}/${round.length}: ${escapeHtml(item.question)}</h3>` +
      item.options.map((opt, oi) => {
        const checked = state.answers[state.currentRound][qi] === oi ? "checked" : "";
        return `<label class="option"><input type="radio" name="q${qi}" value="${oi}" ${checked} onchange="window.__onPick(${qi},${oi})" /> ${String.fromCharCode(65 + oi)}. ${escapeHtml(opt)}</label>`;
      }).join("") + `<div class="feedback" id="fb${qi}"></div>`;
    $("quiz").appendChild(box);
    const dot = document.createElement("div");
    dot.className = "progress-item unanswered"; dot.id = `prog${qi}`; dot.textContent = qi + 1;
    dot.onclick = () => box.scrollIntoView({ behavior: "smooth" });
    $("progress").appendChild(dot);
    const ans = state.answers[state.currentRound][qi];
    if (ans != null) reflectAnswer(qi, ans, submitted);
  });
}

function reflectAnswer(qi, oi, show) {
  const item = state.rounds[state.currentRound][qi];
  const dot = $(`prog${qi}`), fb = $(`fb${qi}`), box = $(`qbox${qi}`);
  if (show) {
    if (oi === item.correctIndex) {
      dot.className = "progress-item correct"; fb.textContent = "✅ Chính xác!"; fb.className = "feedback correct";
      box.classList.remove("incorrect"); box.classList.add("correct");
    } else {
      dot.className = "progress-item incorrect";
      fb.textContent = `❌ Sai. Đáp án: ${String.fromCharCode(65 + item.correctIndex)}. ${item.options[item.correctIndex]}`;
      fb.className = "feedback incorrect"; box.classList.remove("correct"); box.classList.add("incorrect");
    }
  } else { dot.className = "progress-item answered"; }
}

window.__onPick = function (qi, oi) {
  recordAnswer(state, qi, oi);
  reflectAnswer(qi, oi, true);
  const round = state.rounds[state.currentRound];
  if (state.answers[state.currentRound].every((a) => a != null) && !state.submitted[state.currentRound]) {
    state.submitted[state.currentRound] = true;
    const r = roundResult(state);
    $("result").textContent = `🎯 Vòng ${state.currentRound + 1}: đúng ${r.correct}/${r.total}`;
    if (state.currentRound < state.rounds.length - 1) $("nextBtn").style.display = "inline-block";
    const wrong = round.map((item, i) => {
      const a = state.answers[state.currentRound][i];
      return a !== item.correctIndex ? { id: item.id, question: item.question, options: item.options, correctIndex: item.correctIndex, picked: a } : null;
    }).filter(Boolean);
    persistAttempt({ timestamp: new Date().toISOString(), sheetName: currentSheetName, roundIndex: state.currentRound, correct: r.correct, total: r.total, unanswered: 0, wrongQuestions: wrong });
    if (wrong.length) persistWrongQuestions(wrong);
  }
  scheduleSave();
};

$("submitBtn").addEventListener("click", () => { });

$("nextBtn").addEventListener("click", () => {
  if (nextRoundFn(state)) { loadCurrentRound(); scrollTo({ top: 0, behavior: "smooth" }); scheduleSave(); }
});

// ================================================================
//  TAB THI
// ================================================================
$("examUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  $("examStatus").textContent = `Đang đọc ${file.name}...`;
  try {
    const info = readWorkbook(await file.arrayBuffer());
    examWorkbook = info.workbook;
    populateSelect($("examSheetSelect"), info.sheetNames, info.answerSheet);
    $("examSheetSelector").classList.add("show");
    $("examStatus").textContent = `Đã đọc ${info.sheetNames.length} sheet.`;
  } catch (err) { $("examStatus").textContent = "Lỗi: " + err.message; }
});

$("examLoadSheetBtn").addEventListener("click", () => {
  try {
    const result = parseSheet(examWorkbook, $("examSheetSelect").value);
    examQuestions = result.questions;
    if (!examQuestions.length) { $("examStatus").textContent = "Không có câu hỏi hợp lệ."; return; }
    $("examStatus").textContent = `${examQuestions.length} câu hỏi.`;
    $("examSettings").classList.add("show"); $("examTimerSettings").classList.add("show"); $("examStartBtnRow").classList.add("show");
  } catch (err) { $("examStatus").textContent = "Lỗi: " + err.message; }
});

// Exam từ mã tài liệu
$("examLoadCodeBtn")?.addEventListener("click", async () => {
  const code = $("examCodeInput").value.trim().toUpperCase();
  if (!code) return;
  $("examStatus").textContent = "Đang tải...";
  try {
    const docData = await getDocumentByCode(code);
    if (!docData) { $("examStatus").textContent = `❌ Không tìm thấy mã "${code}".`; return; }
    examQuestions = docData.questions;
    $("examStatus").textContent = `✅ "${docData.title}" — ${examQuestions.length} câu.`;
    $("examSettings").classList.add("show"); $("examTimerSettings").classList.add("show"); $("examStartBtnRow").classList.add("show");
    $("examCodeInput").value = "";
  } catch (e) { $("examStatus").textContent = "Lỗi: " + e.message; }
});

$("examStartBtn").addEventListener("click", () => {
  if (!examQuestions.length) { $("examStatus").textContent = "Chưa tải câu hỏi."; return; }
  examState = createState(examQuestions, parseInt($("examNumPerRound").value, 10));
  examTimeRemaining = parseInt($("examTimer").value, 10) * 60;
  ["examSheetSelector", "examSettings", "examTimerSettings", "examStartBtnRow"].forEach((id) => $(id).classList.remove("show"));
  $("examArea").style.display = "block";
  startExamTimer(); loadExamRound();
});

function startExamTimer() {
  updateTimerDisplay();
  examTimerInterval = setInterval(() => {
    examTimeRemaining--;
    updateTimerDisplay();
    if (examTimeRemaining <= 0) { clearInterval(examTimerInterval); examTimerInterval = null; submitExam(true); }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(examTimeRemaining / 60), s = examTimeRemaining % 60;
  $("examTimerDisplay").textContent = `⏱️ ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  $("examTimerDisplay").classList.toggle("warning", examTimeRemaining <= 300);
}

function loadExamRound() {
  $("examRoundInfo").textContent = `Vòng ${examState.currentRound + 1}/${examState.rounds.length}`;
  renderExamRound();
}

function renderExamRound() {
  const round = examState.rounds[examState.currentRound];
  $("examQuiz").innerHTML = ""; $("examProgress").innerHTML = "";
  round.forEach((item, qi) => {
    const box = document.createElement("div");
    box.className = "question"; box.id = `examQbox${qi}`;
    box.innerHTML = `<h3>Câu ${qi + 1}/${round.length}: ${escapeHtml(item.question)}</h3>` +
      item.options.map((opt, oi) =>
        `<label class="option"><input type="radio" name="examQ${qi}" value="${oi}" onchange="window.__onExamPick(${qi},${oi})" /> ${String.fromCharCode(65 + oi)}. ${escapeHtml(opt)}</label>`
      ).join("") + `<div class="feedback" id="examFb${qi}"></div>`;
    $("examQuiz").appendChild(box);
    const dot = document.createElement("div");
    dot.className = "progress-item unanswered"; dot.id = `examProg${qi}`; dot.textContent = qi + 1;
    dot.onclick = () => box.scrollIntoView({ behavior: "smooth" });
    $("examProgress").appendChild(dot);
  });
}

window.__onExamPick = function (qi, oi) {
  if (examState.submitted[examState.currentRound]) return;
  recordAnswer(examState, qi, oi);
  $(`examProg${qi}`).className = "progress-item answered";
};

$("examSubmitBtn").addEventListener("click", () => submitExam(false));

function submitExam(timeUp = false) {
  if (examTimerInterval) { clearInterval(examTimerInterval); examTimerInterval = null; }
  examState.submitted[examState.currentRound] = true;
  const round = examState.rounds[examState.currentRound];
  document.querySelectorAll('#examQuiz input[type="radio"]').forEach((i) => i.disabled = true);
  let correct = 0, unanswered = 0;
  const wrong = [];
  for (let qi = 0; qi < round.length; qi++) {
    const ans = examState.answers[examState.currentRound][qi], item = round[qi];
    if (ans == null) {
      unanswered++;
      $(`examFb${qi}`).textContent = `⚠️ Chưa trả lời. Đáp án: ${String.fromCharCode(65 + item.correctIndex)}. ${item.options[item.correctIndex]}`;
      $(`examFb${qi}`).className = "feedback incorrect"; $(`examProg${qi}`).className = "progress-item unanswered";
      wrong.push({ id: item.id, question: item.question, options: item.options, correctIndex: item.correctIndex, picked: null });
    } else {
      if (ans === item.correctIndex) {
        correct++; $(`examProg${qi}`).className = "progress-item correct";
        $(`examFb${qi}`).textContent = "✅ Chính xác!"; $(`examFb${qi}`).className = "feedback correct"; $(`examQbox${qi}`).classList.add("correct");
      } else {
        $(`examProg${qi}`).className = "progress-item incorrect";
        $(`examFb${qi}`).textContent = `❌ Sai. Đáp án: ${String.fromCharCode(65 + item.correctIndex)}. ${item.options[item.correctIndex]}`;
        $(`examFb${qi}`).className = "feedback incorrect"; $(`examQbox${qi}`).classList.add("incorrect");
        wrong.push({ id: item.id, question: item.question, options: item.options, correctIndex: item.correctIndex, picked: ans });
      }
    }
  }
  const total = round.length, pct = total ? Math.round(correct / total * 100) : 0;
  const grade = pct >= 80 ? "🏆 Xuất sắc" : pct >= 60 ? "✅ Đạt" : "❌ Chưa đạt";
  $("examResult").innerHTML =
    `<div class="exam-result-box"><h2>${grade}</h2>` +
    (timeUp ? `<p class="time-up-notice">⏰ Hết giờ — đã tự nộp.</p>` : "") +
    `<p>Đúng: <strong>${correct}</strong>/${total} (<strong>${pct}%</strong>)</p>` +
    `<p>Sai: <strong style="color:var(--danger)">${total - correct - unanswered}</strong> | Chưa làm: <strong style="color:var(--text-muted)">${unanswered}</strong></p>` +
    (wrong.length ? `<p class="hint">💾 ${wrong.length} câu sai đã lưu vào "Xem lại câu sai".</p>` : `<p class="hint">🎉 Không có câu sai!</p>`) +
    `<button id="examRetryBtn" class="ghost">🔄 Thi lại</button></div>`;
  if (wrong.length) persistWrongQuestions(wrong);
  persistAttempt({ timestamp: new Date().toISOString(), sheetName: "Exam", roundIndex: examState.currentRound, correct, total, unanswered, wrongQuestions: wrong });
  $("examSubmitBtn").style.display = "none";
  $("examResult").scrollIntoView({ behavior: "smooth" });
  $("examRetryBtn").addEventListener("click", () => {
    if (examTimerInterval) clearInterval(examTimerInterval);
    examState = createState(examQuestions, examState.rounds[0].length);
    examTimeRemaining = parseInt($("examTimer").value, 10) * 60;
    $("examResult").innerHTML = ""; $("examQuiz").innerHTML = ""; $("examProgress").innerHTML = "";
    $("examRoundInfo").textContent = ""; $("examTimerDisplay").className = "timer-display";
    $("examSubmitBtn").style.display = "";
    startExamTimer(); loadExamRound(); scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ================================================================
//  TAB XEM LẠI CÂU SAI
// ================================================================
async function loadReviewData() {
  const status = $("reviewStatus"), list = $("reviewList");
  const practiceBtn = $("reviewPracticeBtn"), clearBtn = $("reviewClearBtn");
  let wrong = [];
  if (currentUser) {
    try { wrong = await cloudGetWrongQuestions(currentUser.uid); } catch { }
    if (wrong.length) saveWrongQuestions(wrong).catch(() => { });
  } else {
    wrong = await getWrongQuestions().catch(() => []);
  }
  if (!wrong.length) {
    status.textContent = "Chưa có câu sai nào. Làm bài rồi quay lại!";
    list.innerHTML = ""; practiceBtn.style.display = "none"; clearBtn.style.display = "none"; return;
  }
  status.textContent = `Có ${wrong.length} câu sai:`;
  list.innerHTML = wrong.map((q, i) => {
    const picked = q.picked != null ? `${String.fromCharCode(65 + q.picked)}. ${escapeHtml(q.options[q.picked])}` : "Chưa chọn";
    const correct = `${String.fromCharCode(65 + q.correctIndex)}. ${escapeHtml(q.options[q.correctIndex])}`;
    return `<div class="review-item"><h4>${i + 1}. ${escapeHtml(q.question)}</h4>
      <div class="your-answer">Bạn chọn: ${picked}</div>
      <div class="correct-answer">Đáp án đúng: ${correct}</div></div>`;
  }).join("");
  practiceBtn.style.display = "inline-block"; clearBtn.style.display = "inline-block";
  practiceBtn.onclick = () => practiceWrong(wrong);
  clearBtn.onclick = async () => {
    if (!confirm("Xóa toàn bộ câu sai?")) return;
    await clearWrongQuestions().catch(() => { });
    if (currentUser) await cloudClearWrongQuestions(currentUser.uid).catch(() => { });
    loadReviewData();
  };
}

function practiceWrong(wrong) {
  document.querySelector('[data-tab="learn"]').click();
  questions = wrong.map((q, i) => ({ id: q.id ?? i + 1, question: q.question, options: q.options, correctIndex: q.correctIndex }));
  currentSheetName = "Ôn câu sai";
  state = createState(questions, questions.length);
  $("quizArea").style.display = "block";
  $("status").textContent = `Đang ôn ${questions.length} câu sai.`;
  loadCurrentRound(); scrollTo({ top: 0, behavior: "smooth" }); scheduleSave();
}

// ================================================================
//  TAB LỊCH SỬ
// ================================================================
async function loadHistoryData() {
  const container = $("historyList");
  if (!container) return;
  container.innerHTML = "<p style='color:var(--text-muted)'>Đang tải...</p>";

  let attempts = [];
  if (currentUser) {
    try { attempts = await cloudGetAttempts(currentUser.uid); } catch { }
  }
  if (!attempts.length) {
    container.innerHTML = "<p style='color:var(--text-muted)'>Chưa có lịch sử. Làm bài rồi quay lại!</p>";
    return;
  }
  const sorted = [...attempts].reverse(); // mới nhất lên đầu
  container.innerHTML = `
    <table class="history-table">
      <thead><tr><th>Thời gian</th><th>Tài liệu</th><th>Đúng</th><th>%</th></tr></thead>
      <tbody>
        ${sorted.map((a) => {
    const pct = a.total ? Math.round(a.correct / a.total * 100) : 0;
    const cls = pct >= 70 ? "history-good" : "history-bad";
    return `<tr>
            <td>${escapeHtml(formatTime(a.timestamp))}</td>
            <td>${escapeHtml(a.sheetName || "")}</td>
            <td class="${cls}">${a.correct}/${a.total}</td>
            <td class="${cls}">${pct}%</td>
          </tr>`;
  }).join("")}
      </tbody>
    </table>`;
}
