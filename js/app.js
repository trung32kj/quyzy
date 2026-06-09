// Bootstrap UI: bind sự kiện DOM với logic trong parser.js + quiz.js.

import { readWorkbook, parseSheet } from "./parser.js";
import {
  createState, recordAnswer, isCorrect, roundResult, nextRound as nextRoundFn,
} from "./quiz.js";
import {
  saveCurrentSession, loadCurrentSession, clearCurrentSession,
  saveAttempt, getAllAttempts, clearAttempts,
} from "./storage.js";

const $ = (id) => document.getElementById(id);

// ===== State toàn cục =====
let workbook = null;
let answerSheetSuggested = null;
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
// Module ES có defer nên DOMContentLoaded có thể đã fire — gọi trực tiếp.
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
  $("iconSun").style.display  = theme === "dark" ? "none" : "block";
  $("iconMoon").style.display = theme === "dark" ? "block" : "none";
  try { localStorage.setItem("theme", theme); } catch {}
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

// ===== Bước 1: upload file =====
$("upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("status").textContent = `Đang đọc ${file.name}...`;
  try {
    const buffer = await file.arrayBuffer();
    const info = readWorkbook(buffer);
    workbook = info.workbook;
    answerSheetSuggested = info.answerSheet;
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

// ===== Bước 2: chọn sheet → parse =====
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

// ===== Bước 3: tạo vòng =====
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
  $("submitBtn").style.display = alreadySubmitted ? "none" : "inline-block";
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
        const letter = String.fromCharCode(65 + oi); // A B C D
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

    // Re-apply trạng thái đã trả lời (nếu có)
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
  // Chế độ "thi": ẩn feedback đến khi nộp.
  // Trong M1 mặc định cũng ẩn feedback (chỉ hiện sau khi nộp). M5 sẽ thêm toggle.
  const dot = $(`prog${qi}`);
  if (!state.submitted[state.currentRound]) {
    dot.className = "progress-item answered";
  } else {
    reflectAnswer(qi, optionIndex, true);
  }
  scheduleSave();
};

// ===== Bước 4: nộp bài =====
$("submitBtn").addEventListener("click", () => {
  state.submitted[state.currentRound] = true;
  const round = state.rounds[state.currentRound];
  // Hiện feedback cho tất cả các câu
  for (let qi = 0; qi < round.length; qi++) {
    const ans = state.answers[state.currentRound][qi];
    if (ans != null) {
      reflectAnswer(qi, ans, true);
    } else {
      // Câu không trả lời: hiển thị đáp án đúng
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

  // Lưu attempt + danh sách câu sai để dùng cho M5 (ôn câu sai)
  const wrongQuestions = [];
  for (let qi = 0; qi < round.length; qi++) {
    const ans = state.answers[state.currentRound][qi];
    const item = round[qi];
    if (ans !== item.correctIndex) {
      wrongQuestions.push({
        id: item.id,
        question: item.question,
        picked: ans != null ? item.options[ans] : null,
        correct: item.options[item.correctIndex],
      });
    }
  }
  saveAttempt({
    timestamp: new Date().toISOString(),
    sheetName: currentSheetName,
    roundIndex: state.currentRound,
    correct: r.correct,
    total: r.total,
    unanswered: r.unanswered,
    wrongQuestions,
  }).catch((e) => console.warn("saveAttempt failed", e));
  scheduleSave();
});

$("nextBtn").addEventListener("click", () => {
  if (nextRoundFn(state)) {
    loadCurrentRound();
    window.scrollTo({ top: 0, behavior: "smooth" });
    scheduleSave();
  }
});

// ===== Lịch sử =====
// Removed history button - now using review tab for wrong questions
// $("historyBtn").addEventListener("click", async () => {
//   const panel = $("historyPanel");
//   if (panel.style.display === "block") { panel.style.display = "none"; return; }
//   const list = await getAllAttempts();
//   if (!list.length) {
//     panel.innerHTML = `<em>Chưa có lịch sử.</em>`;
//   } else {
//     const recent = list.slice().reverse(); // mới nhất lên đầu
//     panel.innerHTML =
//       `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">` +
//         `<strong>Lịch sử (${list.length} vòng đã nộp)</strong>` +
//         `<button class="ghost" id="clearHistoryBtn">Xoá lịch sử</button>` +
//       `</div>` +
//       `<table>` +
//         `<thead><tr><th>Thời gian</th><th>Sheet</th><th>Vòng</th><th>Điểm</th><th>Sai</th></tr></thead>` +
//         `<tbody>` + recent.map((a) => {
//           const pct = a.total ? Math.round(a.correct / a.total * 100) : 0;
//           const cls = pct >= 70 ? "history-good" : "history-bad";
//           return `<tr>` +
//             `<td>${escapeHtml(formatTime(a.timestamp))}</td>` +
//             `<td>${escapeHtml(a.sheetName || "")}</td>` +
//             `<td>${(a.roundIndex ?? 0) + 1}</td>` +
//             `<td class="${cls}">${a.correct}/${a.total} (${pct}%)</td>` +
//             `<td>${a.wrongQuestions ? a.wrongQuestions.length : (a.total - a.correct)}</td>` +
//           `</tr>`;
//         }).join("") +
//         `</tbody>` +
//       `</table>`;
//     $("clearHistoryBtn").onclick = async () => {
//       if (confirm("Xoá toàn bộ lịch sử?")) {
//         await clearAttempts();
//         panel.innerHTML = `<em>Đã xoá.</em>`;
//       }
//     };
//   }
//   panel.style.display = "block";
// });

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===== Tab Navigation =====
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      // Remove active class from all tabs
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab
      btn.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.add('active');

      // Load review data when switching to review tab
      if (tabId === 'review') {
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
  } catch (err) {
    $("examStatus").textContent = "Lỗi: " + err.message;
    console.error(err);
  }
});

$("examStartBtn").addEventListener("click", () => {
  const num = parseInt($("examNumPerRound").value, 10);
  const minutes = parseInt($("examTimer").value, 10);
  examState = createState(examQuestions, num);
  examTimeRemaining = minutes * 60; // Convert to seconds

  // Hide settings, show exam area
  $("examSettings").style.display = "none";
  $("examTimerSettings").style.display = "none";
  $("examArea").style.display = "block";

  // Start timer
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
      submitExam(); // Auto-submit when time runs out
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(examTimeRemaining / 60);
  const seconds = examTimeRemaining % 60;
  const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  $("examTimerDisplay").textContent = `⏱️ ${display}`;

  // Warning when less than 5 minutes
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

  round.forEach((item, qi) => {
    const box = document.createElement("div");
    box.className = "question";
    box.id = `examQbox${qi}`;
    box.innerHTML =
      `<h3>Câu ${qi + 1}/${round.length}: ${escapeHtml(item.question)}</h3>` +
      item.options.map((opt, oi) => {
        const letter = String.fromCharCode(65 + oi);
        return (
          `<label class="option">` +
            `<input type="radio" name="examQ${qi}" value="${oi}" ` +
            `onchange="window.__onExamPick(${qi}, ${oi})" />` +
            ` ${letter}. ${escapeHtml(opt)}` +
          `</label>`
        );
      }).join("");
    quiz.appendChild(box);

    const dot = document.createElement("div");
    dot.className = "progress-item unanswered";
    dot.id = `examProg${qi}`;
    dot.textContent = qi + 1;
    dot.onclick = () => box.scrollIntoView({ behavior: "smooth" });
    progress.appendChild(dot);
  });
}

window.__onExamPick = function (qi, optionIndex) {
  recordAnswer(examState, qi, optionIndex);
  const dot = $(`examProg${qi}`);
  dot.className = "progress-item answered";
};

$("examSubmitBtn").addEventListener("click", submitExam);

function submitExam() {
  if (examTimerInterval) {
    clearInterval(examTimerInterval);
  }

  examState.submitted[examState.currentRound] = true;
  const round = examState.rounds[examState.currentRound];

  // Calculate results
  let correct = 0;
  let unanswered = 0;
  const wrongQuestions = [];

  for (let qi = 0; qi < round.length; qi++) {
    const ans = examState.answers[examState.currentRound][qi];
    const item = round[qi];

    if (ans == null) {
      unanswered++;
    } else if (ans === item.correctIndex) {
      correct++;
    } else {
      wrongQuestions.push({
        id: item.id,
        question: item.question,
        picked: item.options[ans],
        correct: item.options[item.correctIndex],
      });
    }
  }

  const total = round.length;
  const pct = total ? Math.round(correct / total * 100) : 0;

  $("examResult").innerHTML =
    `<div style="padding: 20px; text-align: center;">` +
      `<h2 style="color: var(--primary); margin: 0 0 10px;">Kết quả thi</h2>` +
      `<p style="font-size: 1.2rem; margin: 10px 0;">Đúng: <strong>${correct}</strong> / ${total} (${pct}%)</p>` +
      `<p style="color: var(--danger);">Sai: ${total - correct - unanswered} | Chưa làm: ${unanswered}</p>` +
      (wrongQuestions.length > 0 ? `<p style="margin-top: 15px;">${wrongQuestions.length} câu sai đã được lưu vào tab "Xem lại câu sai"</p>` : "") +
      `<button onclick="location.reload()" style="margin-top: 20px;">🔄 Thi lại</button>` +
    `</div>`;

  // Save wrong questions to IndexedDB
  if (wrongQuestions.length > 0) {
    saveWrongQuestions(wrongQuestions);
  }

  // Hide submit button
  $("examSubmitBtn").style.display = "none";
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
      reviewStatus.textContent = "Chưa có câu sai nào.";
      reviewList.innerHTML = "";
      practiceBtn.style.display = "none";
      clearBtn.style.display = "none";
      return;
    }

    reviewStatus.textContent = `Có ${wrongQuestions.length} câu sai:`;
    reviewList.innerHTML = wrongQuestions.map((q, index) => `
      <div class="review-item">
        <h4>${index + 1}. ${escapeHtml(q.question)}</h4>
        <div class="your-answer">Bạn chọn: ${escapeHtml(q.picked || "Chưa chọn")}</div>
        <div class="correct-answer">Đáp án đúng: ${escapeHtml(q.correct)}</div>
      </div>
    `).join("");

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

// ===== Wrong Questions Storage (IndexedDB) =====
const WRONG_QUESTIONS_KEY = "wrongQuestions";

async function saveWrongQuestions(questions) {
  try {
    const existing = await getWrongQuestions() || [];
    const merged = [...existing, ...questions];
    await saveCurrentSession({ wrongQuestions: merged }, WRONG_QUESTIONS_KEY);
  } catch (e) {
    console.error("Error saving wrong questions:", e);
  }
}

async function getWrongQuestions() {
  try {
    const data = await loadCurrentSession(WRONG_QUESTIONS_KEY);
    return data?.wrongQuestions || [];
  } catch (e) {
    console.error("Error getting wrong questions:", e);
    return [];
  }
}

async function clearWrongQuestions() {
  try {
    await clearCurrentSession(WRONG_QUESTIONS_KEY);
  } catch (e) {
    console.error("Error clearing wrong questions:", e);
  }
}

function practiceWrongQuestions(wrongQuestions) {
  // Switch to learn tab and start practice with wrong questions
  const learnTab = document.querySelector('[data-tab="learn"]');
  learnTab.click();

  // Create questions from wrong questions
  questions = wrongQuestions.map((q, index) => ({
    id: q.id || index,
    question: q.question,
    options: [q.picked, q.correct, ...generateDistractors(2)], // Simple options generation
    correctIndex: 1, // Assuming correct is at index 1
  }));

  state = createState(questions, questions.length);
  $("settings").classList.remove("show");
  $("quizArea").style.display = "block";
  loadCurrentRound();
  scheduleSave();
}

function generateDistractors(count) {
  // Simple distractor generation - in real app, this would be more sophisticated
  const distractors = ["A. Phương án A", "B. Phương án B", "C. Phương án C", "D. Phương án D"];
  return distractors.slice(0, count);
}
