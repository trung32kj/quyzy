// Admin Panel JS
import { readWorkbook, parseSheet } from "./parser.js";
import {
    auth, onAuthChange, logout, isAdmin,
    uploadDocument,
    adminGetAllDocuments, adminDeleteDocument, adminUpdateDocumentTitle,
    adminGetAllUsers, adminSetRole,
} from "./firebase.js";

const $ = (id) => document.getElementById(id);

let currentAdminUser = null;
let adminWorkbook = null;
let adminQuestions = [];
let adminSheetName = "";

// ================================================================
//  AUTH GATE — chỉ cho admin vào
// ================================================================
onAuthChange(async (user) => {
    if (!user) {
        showAccessDenied(); return;
    }
    const admin = await isAdmin(user.uid).catch(() => false);
    if (!admin) {
        showAccessDenied(); return;
    }
    currentAdminUser = user;
    $("adminUserDisplay").textContent = user.displayName || user.email;
    $("accessDenied").style.display = "none";
    $("adminContent").style.display = "block";
    loadDocuments();
});

function showAccessDenied() {
    $("accessDenied").style.display = "block";
    $("adminContent").style.display = "none";
}

$("adminLogoutBtn").addEventListener("click", async () => {
    await logout();
    location.href = "./index.html";
});

// ================================================================
//  TAB NAVIGATION
// ================================================================
document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-admin-tab");
        document.querySelectorAll("[data-admin-tab]").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        $(`admin-tab-${tabId}`).classList.add("active");
        if (tabId === "users") loadUsers();
        if (tabId === "documents") loadDocuments();
    });
});

// ================================================================
//  UPLOAD TÀI LIỆU
// ================================================================
$("adminUpload").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $("adminPreview").textContent = `Đang đọc ${file.name}...`;
    try {
        const info = readWorkbook(await file.arrayBuffer());
        adminWorkbook = info.workbook;
        const sel = $("adminSheetSelect");
        sel.innerHTML = "";
        info.sheetNames.forEach((n) => {
            const o = document.createElement("option");
            o.value = o.textContent = n;
            if (n === info.answerSheet) o.selected = true;
            sel.appendChild(o);
        });
        $("adminSheetRow").style.display = "flex";
        $("adminPreview").textContent = `Đã đọc ${info.sheetNames.length} sheet.`;
    } catch (err) {
        $("adminPreview").textContent = "Lỗi: " + err.message;
    }
});

$("adminLoadSheetBtn").addEventListener("click", () => {
    try {
        const sheetName = $("adminSheetSelect").value;
        const result = parseSheet(adminWorkbook, sheetName);
        adminQuestions = result.questions;
        adminSheetName = sheetName;
        if (!adminQuestions.length) { $("adminPreview").textContent = "Không có câu hỏi hợp lệ."; return; }
        $("adminPreview").textContent = `✅ ${adminQuestions.length} câu hỏi hợp lệ (Schema ${result.schema})${result.skipped ? `, bỏ ${result.skipped} dòng lỗi` : ""}.`;
        $("adminUploadBtn").disabled = false;
    } catch (err) {
        $("adminPreview").textContent = "Lỗi: " + err.message;
    }
});

$("adminUploadBtn").addEventListener("click", async () => {
    if (!adminQuestions.length) return;
    const title = $("docTitle").value.trim() || adminSheetName;
    $("adminUploadBtn").disabled = true;
    $("adminUploadBtn").textContent = "Đang upload...";
    try {
        const code = await uploadDocument(
            { title, sheetName: adminSheetName, questions: adminQuestions },
            currentAdminUser.uid
        );
        const result = $("uploadResult");
        result.style.display = "block";
        result.innerHTML =
            `<div class="code-result">
        <p>✅ Upload thành công!</p>
        <p><strong>Tiêu đề:</strong> ${escapeHtml(title)}</p>
        <p><strong>Câu hỏi:</strong> ${adminQuestions.length}</p>
        <p class="code-display">Mã: <strong id="generatedCode">${code}</strong>
          <button class="ghost btn-sm" onclick="copyCode('${code}')">📋 Sao chép</button>
        </p>
        <p style="color:var(--text-muted);font-size:13px;">Gửi mã này cho học viên để tải tài liệu.</p>
      </div>`;
        // Reset form
        $("docTitle").value = ""; $("adminUpload").value = "";
        $("adminSheetRow").style.display = "none"; $("adminPreview").textContent = "";
        $("adminUploadBtn").disabled = true; adminQuestions = [];
        // Reload list
        loadDocuments();
    } catch (err) {
        alert("Lỗi upload: " + err.message);
        $("adminUploadBtn").disabled = false;
    } finally {
        $("adminUploadBtn").textContent = "☁️ Upload & Tạo mã";
    }
});

window.copyCode = function (code) {
    navigator.clipboard.writeText(code)
        .then(() => showToast(`📋 Đã sao chép mã: ${code}`))
        .catch(() => prompt("Sao chép mã này:", code));
};

// ================================================================
//  DANH SÁCH TÀI LIỆU
// ================================================================
$("refreshDocsBtn").addEventListener("click", loadDocuments);

async function loadDocuments() {
    const container = $("docsList");
    container.innerHTML = "<p style='color:var(--text-muted)'>Đang tải...</p>";
    try {
        const docs = await adminGetAllDocuments();
        if (!docs.length) { container.innerHTML = "<p style='color:var(--text-muted)'>Chưa có tài liệu nào.</p>"; return; }
        // Sắp xếp mới nhất lên đầu
        docs.sort((a, b) => {
            const ta = a.createdAt?.seconds || 0, tb = b.createdAt?.seconds || 0;
            return tb - ta;
        });
        container.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Mã</th><th>Tiêu đề</th><th>Câu hỏi</th><th>Lượt dùng</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
        <tbody>
          ${docs.map((d) => `
            <tr id="doc-row-${d.code}">
              <td><code class="code-badge" onclick="copyCode('${d.code}')" title="Click để sao chép">${d.code}</code></td>
              <td>
                <span id="title-display-${d.code}">${escapeHtml(d.title || "")}</span>
                <input type="text" id="title-edit-${d.code}" value="${escapeHtml(d.title || "")}" style="display:none;width:100%;" />
              </td>
              <td>${(d.questions || []).length}</td>
              <td>${d.usageCount || 0}</td>
              <td>${formatTs(d.createdAt)}</td>
              <td class="action-btns">
                <button class="ghost btn-sm" onclick="editDocTitle('${d.code}')">✏️</button>
                <button class="ghost btn-sm danger" onclick="deleteDoc('${d.code}', '${escapeHtml(d.title || d.code)}')">🗑️</button>
              </td>
            </tr>`
        ).join("")}
        </tbody>
      </table>`;
    } catch (err) {
        container.innerHTML = `<p style="color:var(--danger)">Lỗi: ${err.message}</p>`;
    }
}

window.editDocTitle = function (code) {
    const display = $(`title-display-${code}`);
    const input = $(`title-edit-${code}`);
    if (input.style.display === "none") {
        display.style.display = "none"; input.style.display = "inline-block"; input.focus();
        input.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") await saveDocTitle(code, input.value.trim());
            if (e.key === "Escape") { display.style.display = ""; input.style.display = "none"; }
        }, { once: false });
        // Thêm nút save
        const row = $(`doc-row-${code}`);
        const saveBtn = document.createElement("button");
        saveBtn.className = "btn-sm"; saveBtn.textContent = "💾 Lưu"; saveBtn.id = `save-btn-${code}`;
        saveBtn.onclick = () => saveDocTitle(code, input.value.trim());
        input.after(saveBtn);
    }
};

async function saveDocTitle(code, title) {
    if (!title) return;
    await adminUpdateDocumentTitle(code, title);
    $(`title-display-${code}`).textContent = title;
    $(`title-display-${code}`).style.display = "";
    $(`title-edit-${code}`).style.display = "none";
    $(`save-btn-${code}`)?.remove();
}

window.deleteDoc = async function (code, title) {
    if (!confirm(`Xóa tài liệu "${title}" (mã: ${code})?\nHành động này không thể hoàn tác.`)) return;
    try {
        await adminDeleteDocument(code);
        $(`doc-row-${code}`)?.remove();
    } catch (err) { alert("Lỗi: " + err.message); }
};

// ================================================================
//  DANH SÁCH NGƯỜI DÙNG
// ================================================================
$("refreshUsersBtn").addEventListener("click", loadUsers);

async function loadUsers() {
    const container = $("usersList");
    container.innerHTML = "<p style='color:var(--text-muted)'>Đang tải...</p>";
    try {
        const users = await adminGetAllUsers();
        if (!users.length) { container.innerHTML = "<p>Chưa có người dùng nào.</p>"; return; }
        users.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        container.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Tên</th><th>Email</th><th>Role</th><th>Ngày tạo</th><th>Câu sai</th><th>Bài đã làm</th><th>Thao tác</th></tr></thead>
        <tbody>
          ${users.map((u) => `
            <tr>
              <td>${escapeHtml(u.displayName || "(chưa đặt)")}</td>
              <td>${escapeHtml(u.email || "")}</td>
              <td>
                <select class="role-select" data-uid="${u.uid}" onchange="changeRole('${u.uid}', this.value)">
                  <option value="user" ${u.role === "user" ? "selected" : ""}>User</option>
                  <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
                </select>
              </td>
              <td>${formatTs(u.createdAt)}</td>
              <td>${(u.wrongQuestions || []).length}</td>
              <td>${(u.attempts || []).length}</td>
              <td>
                <button class="ghost btn-sm danger" onclick="clearUserData('${u.uid}', '${escapeHtml(u.displayName || u.email)}')">🗑️ Xóa data</button>
              </td>
            </tr>`
        ).join("")}
        </tbody>
      </table>
      <p style="color:var(--text-muted);font-size:13px;margin-top:8px;">Tổng: ${users.length} người dùng</p>`;
    } catch (err) {
        container.innerHTML = `<p style="color:var(--danger)">Lỗi: ${err.message}<br>Kiểm tra Firestore rules.</p>`;
    }
}

window.changeRole = async function (uid, role) {
    try {
        await adminSetRole(uid, role);
    } catch (err) { alert("Lỗi đổi role: " + err.message); }
};

window.clearUserData = async function (uid, name) {
    if (!confirm(`Xóa toàn bộ câu sai và lịch sử của "${name}"?`)) return;
    try {
        const { db } = await import("./firebase.js");
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        await updateDoc(doc(db, "users", uid), { wrongQuestions: [], attempts: [] });
        loadUsers();
    } catch (err) { alert("Lỗi: " + err.message); }
};

// ================================================================
//  HELPERS
// ================================================================
function formatTs(ts) {
    if (!ts) return "—";
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
        return d.toLocaleDateString("vi-VN");
    } catch { return "—"; }
}

function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ================================================================
//  TOAST NOTIFICATION
// ================================================================
function showToast(msg) {
    let toast = document.getElementById("adminToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "adminToast";
        toast.style.cssText = `
            position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
            background:#323232; color:#fff; padding:12px 24px;
            border-radius:8px; font-size:14px; font-weight:500;
            box-shadow:0 4px 12px rgba(0,0,0,0.3); z-index:9999;
            transition:opacity 0.3s; white-space:nowrap;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = "0"; }, 2000);
}
