// Bootstrap UI: bind sự kiện DOM với logic trong parser.js + quiz.js.

import { readWorkbook, parseSheet } from "./parser.js";
import {
  createState, recordAnswer, isCorrect, roundResult, nextRound as nextRoundFn,
} from "./quiz.js";
import {
  saveCurrentSession, loadCurrentSession, clearCurrentSession,
  saveAttempt, getAllAttempts, clearAttempts,
  saveWrongQuestions, getWrongQuestions, clearWrongQuestions,
  getCurrentUser, setCurrentUser, clearCurrentUser,
} from "./storage.js";

const $ = (id) => document.getElementById(id);

// ===== State toàn cục =====
let workbook = null;
let questions = [];
let state = null;
let currentSheetName = "";

// ===== Exam mode state =====
let examWorkbook = null;
let examQuestions = [];
let examState = null;
let examTimerInterval = null;
let examTimeRemaining = 0;

// Debounce auto-save
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (state && questions.length) {
      saveCurrentSession({
        sheetName: currentSheetName,
        questions,
        state,
        savedAt: new Date().toISOString(),
      }).catch((e) => console.warn("save failed", e));
    }
  }, 300);
}

// ===== Khởi động: kiểm tra phiên dở =====
async function initResume() {
  try {
    const session = await loadCurrentSession();
    if (session && session.state && session.questions) {
      const r = session.state.currentRound + 1;
      const total = session.state.rounds.length;
      $("resumeText").textContent =
        `Phiên đang dở: "${session.sheetName}" — vòng ${r}/${total} ` +
        `(lưu lúc ${formatTime(session.savedAt)}).`;
      $("resumeBanner").style.display = "flex";
      $("resumeBtn").onclick = () => resumeSession(session);
      $("discardBtn").onclick = async () => {
        await clearCurrentSession();
        $("resumeBanner").style.display = "none";
      };
    }
  } catch (e) {
    console.warn("Không load được phiên cũ:", e);
  }
}
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initResume);
} else {
  initResume();
}

// ===== Service Worker (PWA offline) =====
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((reg) => console.log("SW registered:", reg.scope))
      .catch((err) => console.warn("SW register failed:", err));
  });
}

// ===== Theme toggle =====
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("iconSun").style.display = theme === "dark" ? "none" : "block";
  $("iconMoon").style.display = theme === "dark" ? "block" : "none";
  try { localStorage.setItem("theme", theme); } catch { }
}
function initTheme() {
  const t = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(t);
  $("themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });
}
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initTheme);
} else {
  initTheme();
}

// ===== Sticky topbar shadow on scroll =====
window.addEventListener("scroll", () => {
  const tb = document.querySelector(".topbar");
  if (!tb) return;
  if (window.scrollY > 4) tb.classList.add("scrolled");
  else tb.classList.remove("scrolled");
}, { passive: true });

// ===== User Login/Logout =====
async function initUserAuth() {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    // User already logged in
    $("loginModal").style.display = "none";
    $("userBtn").style.display = "flex";
    $("currentUserDisplay").textContent = currentUser;
  } else {
    // Show login modal
    $("loginModal").style.display = "flex";
    $("userBtn").style.display = "none";
  }

  // Login button
  $("loginBtn").addEventListener("click", async () => {
    const username = $("usernameInput").value.trim();
    if (!username) {
      alert("Vui lòng nhập tên người dùng!");
      return;
    }
    await setCurrentUser(username);
    $("loginModal").style.display = "none";
    $("userBtn").style.display = "flex";
    $("currentUserDisplay").textContent = username;
    // Reload data for this user
    await initResume();
  });

  // Logout button
  $("userBtn").addEventListener("click", async () => {
    if (confirm("Bạn có chắc muốn đăng xuất?")) {
      await clearCurrentUser();
      $("loginModal").style.display = "flex";
      $("userBtn").style.display = "none";
      $("usernameInput").value = "";
      // Clear current session
      state = null;
      questions = [];
      workbook = null;
      $("quizArea").style.display = "none";
      $("status").textContent = "";
    }
  });

  // Allow Enter key to login
  $("usernameInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      $("loginBtn").click();
    }
  });
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initUserAuth);
} else {
  initUserAuth();
}

function resumeSession(session) {
  questions = session.questions;
  state = session.state;
  currentSheetName = session.sheetName;
  $("resumeBanner").style.display = "none";
  $("status").textContent = `Tiếp tục: ${questions.length} câu, vòng ${state.currentRound + 1}/${state.rounds.length}.`;
  $("quizArea").style.display = "block";
  loadCurrentRound();
}

function formatTime(iso) {
  if (!iso) return "?";
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN");
  } catch { return iso; }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===== Bước 1: upload file (Learn tab) =====
$("upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("status").textContent = `Đang đọc ${file.name}...`;
  try {
    const buffer = await file.arrayBuffer();
    const info = readWorkbook(buffer);
    workbook = info.workbook;
    populateSheetSelect(info.sheetNames, info.answerSheet);
    $("sheetSelector").classList.add("show");
    $("status").textContent =
      `Đã đọc ${info.sheetNames.length} sheet. ` +
      (info.answerSheet
        ? `Gợi ý chọn sheet "${info.answerSheet}" (chứa đáp án có dấu *).`
        : "Chọn sheet phù hợp.");
  } catch (err) {
    $("status").textContent = "Lỗi: " + err.message;
    console.error(err);
  }
});

function populateSheetSelect(names, defaultName) {
  const sel = $("sheetSelect");
  sel.innerHTML = "";
  names.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    if (n === defaultName) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ===== Bước 2: chọn sheet → parse (Learn tab) =====
$("loadSheetBtn").addEventListener("click", () => {
  const sheetName = $("sheetSelect").value;
  try {
    const result = parseSheet(workbook, sheetName);
    questions = result.questions;
    currentSheetName = sheetName;
    if (questions.length === 0) {
      $("status").textContent = `Sheet "${sheetName}" không có câu hỏi hợp lệ.`;
      return;
    }
    const detail = result.info
      ? ` [đáp án: ${result.info.starUsed} qua dấu *, ${result.info.highlightUsed} qua tô màu]`
      : "";
    $("status").textContent =
      `Schema ${result.schema} | ${questions.length} câu hỏi` +
      (result.skipped ? ` (bỏ qua ${result.skipped} dòng không hợp lệ)` : "") +
      detail;
    $("settings").classList.add("show");
  } catch (err) {
    $("status").textContent = "Lỗi: " + err.message;
    console.error(err);
  }
});

// ===== Bước 3: tạo vòng (Learn tab) =====
$("startBtn").addEventListener("click", () => {
  const num = parseInt($("numPerRound").value, 10);
  state = createState(questions, num);
  $("settings").classList.remove("show");
  $("quizArea").style.display = "block";
  loadCurrentRound();
  scheduleSave();
});

function loadCurrentRound() {
  $("roundInfo").textContent =
    `Vòng ${state.currentRound + 1}/${state.rounds.length}`;
  renderRound();
  const alreadySubmitted = state.submitted[state.currentRound];
  const isLastRound = state.currentRound >= state.rounds.length - 1;
  $("submitBtn").style.display = "none"; // Tab Học: feedback hiện ngay, không cần nút Nộp
  $("nextBtn").style.display = (alreadySubmitted && !isLastRound) ? "inline-block" : "none";
  if (alreadySubmitted) {
    const r = roundResult(state);
    $("result").textContent =
      `🎯 Vòng ${state.currentRound + 1}: đúng ${r.correct}/${r.total}` +
      (r.unanswered ? ` (chưa làm: ${r.unanswered})` : "");
  } else {
    $("result").textContent = "";
  }
}

function renderRound() {
  const round = state.rounds[state.currentRound];
  const quiz = $("quiz");
  quiz.innerHTML = "";
  const progress = $("progress");
  progress.innerHTML = "";
  const submitted = state.submitted[state.currentRound];

  round.forEach((item, qi) => {
    const box = document.createElement("div");
    box.className = "question";
    box.id = `qbox${qi}`;
    box.innerHTML =
      `<h3>Câu ${qi + 1}/${round.length}: ${escapeHtml(item.question)}</h3>` +
      item.options.map((opt, oi) => {
        const checked = state.answers[state.currentRound][qi] === oi ? "checked" : "";
        const letter = String.fromCharCode(65 + oi);
        return (
          `<label class="option">` +
          `<input type="radio" name="q${qi}" value="${oi}" ${checked} ` +
          `onchange="window.__onPick(${qi}, ${oi})" />` +
          ` ${letter}. ${escapeHtml(opt)}` +
          `</label>`
        );
      }).join("") +
      `<div class="feedback" id="fb${qi}"></div>`;
    quiz.appendChild(box);

    const dot = document.createElement("div");
    dot.className = "progress-item unanswered";
    dot.id = `prog${qi}`;
    dot.textContent = qi + 1;
    dot.onclick = () => box.scrollIntoView({ behavior: "smooth" });
    progress.appendChild(dot);

    const ans = state.answers[state.currentRound][qi];
    if (ans != null) {
      reflectAnswer(qi, ans, submitted);
    }
  });
}

function reflectAnswer(qi, optionIndex, showFeedback) {
  const item = state.rounds[state.currentRound][qi];
  const dot = $(`prog${qi}`);
  const fb = $(`fb${qi}`);
  const box = $(`qbox${qi}`);

  if (showFeedback) {
    if (optionIndex === item.correctIndex) {
      dot.className = "progress-item correct";
      fb.textContent = "✅ Chính xác!";
      fb.className = "feedback correct";
      box.classList.remove("incorrect");
      box.classList.add("correct");
    } else {
      dot.className = "progress-item incorrect";
      const correctLetter = String.fromCharCode(65 + item.correctIndex);
      fb.textContent = `❌ Sai. Đáp án đúng: ${correctLetter}. ${item.options[item.correctIndex]}`;
      fb.className = "feedback incorrect";
      box.classList.remove("correct");
      box.classList.add("incorrect");
    }
  } else {
    dot.className = "progress-item answered";
  }
}

window.__onPick = function (qi, optionIndex) {
  recordAnswer(state, qi, optionIndex);
  // Tab Học: hiện feedback ngay khi chọn đáp án
  reflectAnswer(qi, optionIndex, true);

  // Kiểm tra đã trả lời hết chưa → tự động "submit" để mở nút Vòng tiếp theo
  const round = state.rounds[state.currentRound];
  const allAnswered = state.answers[state.currentRound].every((a) => a != null);
  if (allAnswered && !state.submitted[state.currentRound]) {
    state.submitted[state.currentRound] = true;
    const r = roundResult(state);
    $("result").textContent =
      `🎯 Vòng ${state.currentRound + 1}: đúng ${r.correct}/${r.total}`;
    $("submitBtn").style.display = "none";
    const isLastRound = state.currentRound >= state.rounds.length - 1;
    if (!isLastRound) {
      $("nextBtn").style.display = "inline-block";
    }
    // Lưu câu sai
    const wrongItems = [];
    for (let i = 0; i < round.length; i++) {
      const ans = state.answers[state.currentRound][i];
      const item = round[i];
      if (ans !== item.correctIndex) {
        wrongItems.push({ id: item.id, question: item.question, options: item.options, correctIndex: item.correctIndex, picked: ans });
      }
    }
    saveAttempt({
      timestamp: new Date().toISOString(),
      sheetName: currentSheetName,
      roundIndex: state.currentRound,
      correct: r.correct,
      total: r.total,
      unanswered: 0,
      wrongQuestions: wrongItems,
    }).catch((e) => console.warn("saveAttempt failed", e));
    if (wrongItems.length > 0) {
      saveWrongQuestions(wrongItems).catch((e) => console.warn("saveWrongQuestions failed", e));
    }
  }

  scheduleSave();
};

// ===== Bước 4: nộp bài (Learn tab) =====
$("submitBtn").addEventListener("click", () => {
  state.submitted[state.currentRound] = true;
  const round = state.rounds[state.currentRound];
  for (let qi = 0; qi < round.length; qi++) {
    const ans = state.answers[state.currentRound][qi];
    if (ans != null) {
      reflectAnswer(qi, ans, true);
    } else {
      const item = round[qi];
      const correctLetter = String.fromCharCode(65 + item.correctIndex);
      $(`fb${qi}`).textContent = `⚠️ Chưa trả lời. Đáp án đúng: ${correctLetter}. ${item.options[item.correctIndex]}`;
      $(`fb${qi}`).className = "feedback incorrect";
      $(`prog${qi}`).className = "progress-item unanswered";
    }
  }
  const r = roundResult(state);
  $("result").textContent =
    `🎯 Vòng ${state.currentRound + 1}: đúng ${r.correct}/${r.total}` +
    (r.unanswered ? ` (chưa làm: ${r.unanswered})` : "");
  $("submitBtn").style.display = "none";
  const isLastRound = state.currentRound >= state.rounds.length - 1;
  if (!isLastRound) {
    $("nextBtn").style.display = "inline-block";
  }

  // Lưu câu sai (đủ thông tin để ôn tập lại)
  const wrongItems = [];
  for (let qi = 0; qi < round.length; qi++) {
    const ans = state.answers[state.currentRound][qi];
    const item = round[qi];
    if (ans !== item.correctIndex) {
      wrongItems.push({
        id: item.id,
        question: item.question,
        options: item.options,
        correctIndex: item.correctIndex,
        picked: ans,
      });
    }
  }

  // Lưu attempt history
  saveAttempt({
    timestamp: new Date().toISOString(),
    sheetName: currentSheetName,
    roundIndex: state.currentRound,
    correct: r.correct,
    total: r.total,
    unanswered: r.unanswered,
    wrongQuestions: wrongItems,
  }).catch((e) => console.warn("saveAttempt failed", e));

  // Lưu danh sách câu sai vào kho ôn tập
  if (wrongItems.length > 0) {
    saveWrongQuestions(wrongItems).catch((e) => console.warn("saveWrongQuestions failed", e));
  }

  scheduleSave();
});

$("nextBtn").addEventListener("click", () => {
  if (nextRoundFn(state)) {
    loadCurrentRound();
    window.scrollTo({ top: 0, behavior: "smooth" });
    scheduleSave();
  }
});

// ===== Tab Navigation =====
function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${tabId}`).classList.add("active");
      if (tabId === "review") {
        loadReviewData();
      }
    });
  });
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initTabs);
} else {
  initTabs();
}

// ===== Exam Mode =====
$("examUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("examStatus").textContent = `Đang đọc ${file.name}...`;
  try {
    const buffer = await file.arrayBuffer();
    const info = readWorkbook(buffer);
    examWorkbook = info.workbook;
    populateExamSheetSelect(info.sheetNames, info.answerSheet);
    $("examSheetSelector").classList.add("show");
    $("examStatus").textContent =
      `Đã đọc ${info.sheetNames.length} sheet. ` +
      (info.answerSheet
        ? `Gợi ý chọn sheet "${info.answerSheet}" (chứa đáp án có dấu *).`
        : "Chọn sheet phù hợp.");
  } catch (err) {
    $("examStatus").textContent = "Lỗi: " + err.message;
    console.error(err);
  }
});

function populateExamSheetSelect(names, defaultName) {
  const sel = $("examSheetSelect");
  sel.innerHTML = "";
  names.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    if (n === defaultName) opt.selected = true;
    sel.appendChild(opt);
  });
}

$("examLoadSheetBtn").addEventListener("click", () => {
  const sheetName = $("examSheetSelect").value;
  try {
    const result = parseSheet(examWorkbook, sheetName);
    examQuestions = result.questions;
    if (examQuestions.length === 0) {
      $("examStatus").textContent = `Sheet "${sheetName}" không có câu hỏi hợp lệ.`;
      return;
    }
    const detail = result.info
      ? ` [đáp án: ${result.info.starUsed} qua dấu *, ${result.info.highlightUsed} qua tô màu]`
      : "";
    $("examStatus").textContent =
      `Schema ${result.schema} | ${examQuestions.length} câu hỏi` +
      (result.skipped ? ` (bỏ qua ${result.skipped} dòng không hợp lệ)` : "") +
      detail;
    $("examSettings").classList.add("show");
    $("examTimerSettings").classList.add("show");
    $("examStartBtnRow").classList.add("show");
  } catch (err) {
    $("examStatus").textContent = "Lỗi: " + err.message;
    console.error(err);
  }
});

$("examStartBtn").addEventListener("click", () => {
  if (!examQuestions.length) {
    $("examStatus").textContent = "Vui lòng tải file và chọn sheet trước.";
    return;
  }
  const num = parseInt($("examNumPerRound").value, 10);
  const minutes = parseInt($("examTimer").value, 10);
  examState = createState(examQuestions, num);
  examTimeRemaining = minutes * 60;

  // Ẩn phần cài đặt
  $("examSheetSelector").classList.remove("show");
  $("examSettings").classList.remove("show");
  $("examTimerSettings").classList.remove("show");
  $("examStartBtnRow").classList.remove("show");
  $("examArea").style.display = "block";

  startExamTimer();
  loadExamRound();
});

function startExamTimer() {
  updateTimerDisplay();
  examTimerInterval = setInterval(() => {
    examTimeRemaining--;
    updateTimerDisplay();
    if (examTimeRemaining <= 0) {
      clearInterval(examTimerInterval);
      examTimerInterval = null;
      submitExam(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(examTimeRemaining / 60);
  const seconds = examTimeRemaining % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  $("examTimerDisplay").textContent = `⏱️ ${display}`;
  if (examTimeRemaining <= 300) {
    $("examTimerDisplay").classList.add("warning");
  } else {
    $("examTimerDisplay").classList.remove("warning");
  }
}

function loadExamRound() {
  $("examRoundInfo").textContent =
    `Vòng ${examState.currentRound + 1}/${examState.rounds.length}`;
  renderExamRound();
}

function renderExamRound() {
  const round = examState.rounds[examState.currentRound];
  const quiz = $("examQuiz");
  quiz.innerHTML = "";
  const progress = $("examProgress");
  progress.innerHTML = "";
  const submitted = examState.submitted[examState.currentRound];

  round.forEach((item, qi) => {
    const box = document.createElement("div");
    box.className = "question";
    box.id = `examQbox${qi}`;
    const checked = submitted ? "" : "";  // will be re-applied below
    box.innerHTML =
      `<h3>Câu ${qi + 1}/${round.length}: ${escapeHtml(item.question)}</h3>` +
      item.options.map((opt, oi) => {
        const isChecked = examState.answers[examState.currentRound][qi] === oi ? "checked" : "";
        const letter = String.fromCharCode(65 + oi);
        return (
          `<label class="option" id="examOpt${qi}_${oi}">` +
          `<input type="radio" name="examQ${qi}" value="${oi}" ${isChecked} ` +
          `onchange="window.__onExamPick(${qi}, ${oi})" />` +
          ` ${letter}. ${escapeHtml(opt)}` +
          `</label>`
        );
      }).join("") +
      `<div class="feedback" id="examFb${qi}"></div>`;
    quiz.appendChild(box);

    const dot = document.createElement("div");
    dot.className = "progress-item unanswered";
    dot.id = `examProg${qi}`;
    dot.textContent = qi + 1;
    dot.onclick = () => box.scrollIntoView({ behavior: "smooth" });
    progress.appendChild(dot);

    const ans = examState.answers[examState.currentRound][qi];
    if (ans != null) {
      reflectExamAnswer(qi, ans, submitted);
    }
  });
}

function reflectExamAnswer(qi, optionIndex, showFeedback) {
  const item = examState.rounds[examState.currentRound][qi];
  const dot = $(`examProg${qi}`);
  const fb = $(`examFb${qi}`);
  const box = $(`examQbox${qi}`);

  if (showFeedback) {
    if (optionIndex === item.correctIndex) {
      dot.className = "progress-item correct";
      fb.textContent = "✅ Chính xác!";
      fb.className = "feedback correct";
      box.classList.remove("incorrect");
      box.classList.add("correct");
    } else {
      dot.className = "progress-item incorrect";
      const correctLetter = String.fromCharCode(65 + item.correctIndex);
      fb.textContent = `❌ Sai. Đáp án đúng: ${correctLetter}. ${item.options[item.correctIndex]}`;
      fb.className = "feedback incorrect";
      box.classList.remove("correct");
      box.classList.add("incorrect");
    }
  } else {
    dot.className = "progress-item answered";
  }
}

window.__onExamPick = function (qi, optionIndex) {
  if (examState.submitted[examState.currentRound]) return; // đã nộp → không cho chọn lại
  recordAnswer(examState, qi, optionIndex);
  $(`examProg${qi}`).className = "progress-item answered";
};

$("examSubmitBtn").addEventListener("click", () => submitExam(false));

function submitExam(timeUp = false) {
  if (examTimerInterval) {
    clearInterval(examTimerInterval);
    examTimerInterval = null;
  }

  examState.submitted[examState.currentRound] = true;
  const round = examState.rounds[examState.currentRound];

  // Disable tất cả radio
  document.querySelectorAll('#examQuiz input[type="radio"]').forEach((inp) => {
    inp.disabled = true;
  });

  // Hiện feedback từng câu
  let correct = 0;
  let unanswered = 0;
  const wrongItems = [];

  for (let qi = 0; qi < round.length; qi++) {
    const ans = examState.answers[examState.currentRound][qi];
    const item = round[qi];

    if (ans == null) {
      unanswered++;
      const correctLetter = String.fromCharCode(65 + item.correctIndex);
      $(`examFb${qi}`).textContent = `⚠️ Chưa trả lời. Đáp án đúng: ${correctLetter}. ${item.options[item.correctIndex]}`;
      $(`examFb${qi}`).className = "feedback incorrect";
      $(`examProg${qi}`).className = "progress-item unanswered";
      wrongItems.push({ id: item.id, question: item.question, options: item.options, correctIndex: item.correctIndex, picked: null });
    } else {
      reflectExamAnswer(qi, ans, true);
      if (ans === item.correctIndex) {
        correct++;
      } else {
        wrongItems.push({ id: item.id, question: item.question, options: item.options, correctIndex: item.correctIndex, picked: ans });
      }
    }
  }

  const total = round.length;
  const pct = total ? Math.round(correct / total * 100) : 0;
  const grade = pct >= 80 ? "🏆 Xuất sắc" : pct >= 60 ? "✅ Đạt" : "❌ Chưa đạt";

  $("examResult").innerHTML =
    `<div class="exam-result-box">` +
    `<h2>${grade}</h2>` +
    (timeUp ? `<p class="time-up-notice">⏰ Hết giờ — bài đã tự động nộp.</p>` : "") +
    `<p>Đúng: <strong>${correct}</strong> / ${total} (<strong>${pct}%</strong>)</p>` +
    `<p>Sai: <strong style="color:var(--danger)">${total - correct - unanswered}</strong> &nbsp;|&nbsp; Chưa làm: <strong style="color:var(--text-muted)">${unanswered}</strong></p>` +
    (wrongItems.length > 0
      ? `<p class="hint">💾 ${wrongItems.length} câu sai đã lưu vào tab <em>"Xem lại câu sai"</em> để ôn tập.</p>`
      : `<p class="hint">🎉 Không có câu sai!</p>`) +
    `<button id="examRetryBtn" class="ghost">🔄 Thi lại bộ câu này</button>` +
    `</div>`;

  // Lưu wrong questions
  if (wrongItems.length > 0) {
    saveWrongQuestions(wrongItems).catch((e) => console.warn("saveWrongQuestions failed", e));
  }

  // Lưu attempt
  saveAttempt({
    timestamp: new Date().toISOString(),
    sheetName: "Exam",
    roundIndex: examState.currentRound,
    correct,
    total,
    unanswered,
    wrongQuestions: wrongItems,
  }).catch((e) => console.warn("saveAttempt failed", e));

  $("examSubmitBtn").style.display = "none";
  $("examResult").scrollIntoView({ behavior: "smooth" });

  // Thi lại cùng bộ câu
  $("examRetryBtn").addEventListener("click", () => {
    if (examTimerInterval) clearInterval(examTimerInterval);
    const num = examState.rounds[0].length;
    const minutes = parseInt($("examTimer").value, 10);
    examState = createState(examQuestions, num);
    examTimeRemaining = minutes * 60;
    // Reset UI
    $("examResult").innerHTML = "";
    $("examQuiz").innerHTML = "";
    $("examProgress").innerHTML = "";
    $("examRoundInfo").textContent = "";
    $("examTimerDisplay").className = "timer-display";
    $("examSubmitBtn").style.display = "";
    startExamTimer();
    loadExamRound();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ===== Review Mode (Xem lại câu sai) =====
async function loadReviewData() {
  const reviewStatus = $("reviewStatus");
  const reviewList = $("reviewList");
  const practiceBtn = $("reviewPracticeBtn");
  const clearBtn = $("reviewClearBtn");

  try {
    const wrongQuestions = await getWrongQuestions();

    if (!wrongQuestions || wrongQuestions.length === 0) {
      reviewStatus.textContent = "Chưa có câu sai nào. Làm bài rồi quay lại đây!";
      reviewList.innerHTML = "";
      practiceBtn.style.display = "none";
      clearBtn.style.display = "none";
      return;
    }

    reviewStatus.textContent = `Có ${wrongQuestions.length} câu sai (từ các lần làm bài):`;
    reviewList.innerHTML = wrongQuestions.map((q, index) => {
      const pickedText = q.picked != null
        ? `${String.fromCharCode(65 + q.picked)}. ${escapeHtml(q.options[q.picked])}`
        : "Chưa chọn";
      const correctText = `${String.fromCharCode(65 + q.correctIndex)}. ${escapeHtml(q.options[q.correctIndex])}`;
      return `
        <div class="review-item">
          <h4>${index + 1}. ${escapeHtml(q.question)}</h4>
          <div class="your-answer">Bạn chọn: ${pickedText}</div>
          <div class="correct-answer">Đáp án đúng: ${correctText}</div>
        </div>
      `;
    }).join("");

    practiceBtn.style.display = "inline-block";
    clearBtn.style.display = "inline-block";

    practiceBtn.onclick = () => practiceWrongQuestions(wrongQuestions);
    clearBtn.onclick = async () => {
      if (confirm("Xóa toàn bộ danh sách câu sai?")) {
        await clearWrongQuestions();
        loadReviewData();
      }
    };
  } catch (e) {
    console.error("Error loading review data:", e);
    reviewStatus.textContent = "Lỗi khi tải dữ liệu.";
  }
}

/**
 * Ôn tập lại các câu sai: chuyển sang tab Học và bắt đầu quiz với đúng bộ câu đó.
 * Câu sai đã có đủ options + correctIndex (lưu sau khi xáo đáp án) nên có thể dùng trực tiếp.
 */
function practiceWrongQuestions(wrongQuestions) {
  // Chuyển sang tab Học
  document.querySelector('[data-tab="learn"]').click();

  // Dùng trực tiếp wrong questions (đã có options + correctIndex đúng)
  // Đặt id liên tiếp để quiz.js hoạt động
  questions = wrongQuestions.map((q, i) => ({
    id: q.id ?? i + 1,
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
  }));
  currentSheetName = "Ôn câu sai";

  state = createState(questions, questions.length);
  $("settings").classList.remove("show");
  $("sheetSelector").classList.remove("show");
  $("quizArea").style.display = "block";
  $("status").textContent = `Đang ôn tập ${questions.length} câu sai.`;
  loadCurrentRound();
  window.scrollTo({ top: 0, behavior: "smooth" });
  scheduleSave();
}
