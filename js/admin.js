// Admin Panel JS
import { readWorkbook, parseSheet } from "./parser.js";
import {
    auth, onAuthChange, logout, isAdmin,
    uploadDocument, resetPasswordEmail,
    adminGetAllDocuments, adminDeleteDocument, adminUpdateDocumentTitle, adminToggleDocument,
    adminGetAllUsers, adminSetRole, adminToggleBan,
    adminGetAllUserUploads, adminConvertUpload, adminDeleteUserUpload,
    getSystemSettings, adminUpdateSystemSettings,
} from "./firebase.js";

const $ = (id) => document.getElementById(id);

let currentAdminUser = null;
let adminWorkbook = null;
// sheetData: Map<sheetName, { questions, title }>
let sheetData = new Map();

// ================================================================
//  AUTH GATE
// ================================================================
onAuthChange(async (user) => {
    if (!user) { showAccessDenied(); return; }
    const admin = await isAdmin(user.uid).catch(() => false);
    if (!admin) { showAccessDenied(); return; }
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
        if (tabId === "uploads") loadUserUploads();
        if (tabId === "system") loadSystemSettings();
    });
});

// ================================================================
//  UPLOAD TÀI LIỆU — NHIỀU SHEET
// ================================================================
$("adminUpload").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $("adminPreview").textContent = `Đang đọc ${file.name}...`;
    sheetData.clear();
    try {
        const info = readWorkbook(await file.arrayBuffer());
        adminWorkbook = info.workbook;

        // Render danh sách sheet với checkbox
        const container = $("adminSheetList");
        container.innerHTML = "";
        info.sheetNames.forEach((name) => {
            const row = document.createElement("div");
            row.className = "sheet-check-row";
            row.innerHTML = `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" class="sheet-checkbox" data-sheet="${escapeHtml(name)}"
                        ${name === info.answerSheet ? "checked" : ""} />
                    <span class="sheet-name">${escapeHtml(name)}</span>
                    <span class="sheet-preview-text" id="preview-${escapeHtml(name)}"
                        style="font-size:12px;color:var(--text-muted);"></span>
                </label>
                <input type="text" class="sheet-title-input" data-sheet="${escapeHtml(name)}"
                    placeholder="Tiêu đề (để trống = dùng tên sheet)"
                    style="margin-left:28px;margin-top:4px;width:calc(100% - 28px);font-size:13px;" />
            `;
            container.appendChild(row);

            // Parse ngay để preview
            try {
                const result = parseSheet(adminWorkbook, name);
                const previewEl = document.getElementById(`preview-${escapeHtml(name)}`);
                if (previewEl) {
                    previewEl.textContent = `(${result.questions.length} câu)`;
                }
                sheetData.set(name, { questions: result.questions, schema: result.schema });
            } catch { }
        });

        $("adminSheetRow").style.display = "block";
        $("adminPreview").textContent = `File: ${file.name} — ${info.sheetNames.length} sheet. Chọn sheet muốn upload:`;
        $("adminUploadBtn").disabled = false;
        $("adminCancelBtn").style.display = "inline-block";
    } catch (err) {
        $("adminPreview").textContent = "Lỗi: " + err.message;
    }
});

$("adminUploadBtn").addEventListener("click", async () => {
    const checked = document.querySelectorAll(".sheet-checkbox:checked");
    if (!checked.length) { showToast("Chưa chọn sheet nào."); return; }

    $("adminUploadBtn").disabled = true;
    $("adminUploadBtn").textContent = "Đang upload...";
    const results = [];

    for (const cb of checked) {
        const sheetName = cb.getAttribute("data-sheet");
        const titleInput = document.querySelector(`.sheet-title-input[data-sheet="${sheetName}"]`);
        const title = titleInput?.value.trim() || sheetName;
        const subjectInput = $("adminSubject");
        const subject = subjectInput?.value.trim() || "";
        const data = sheetData.get(sheetName);
        if (!data || !data.questions.length) {
            results.push({ sheetName, error: "Không có câu hỏi hợp lệ." });
            continue;
        }
        try {
            const code = await uploadDocument(
                { title, sheetName, questions: data.questions, subject },
                currentAdminUser.uid
            );
            results.push({ sheetName, title, code, count: data.questions.length });
        } catch (err) {
            results.push({ sheetName, error: err.message });
        }
    }

    // Hiện kết quả
    const result = $("uploadResult");
    result.style.display = "block";
    result.innerHTML = results.map((r) => r.error
        ? `<div class="upload-result-row error">❌ <strong>${escapeHtml(r.sheetName)}</strong>: ${escapeHtml(r.error)}</div>`
        : `<div class="upload-result-row success">
            ✅ <strong>${escapeHtml(r.title)}</strong> — ${r.count} câu
            <span class="code-badge" onclick="copyCode('${r.code}')" title="Click để sao chép">${r.code}</span>
           </div>`
    ).join("");

    $("adminUploadBtn").disabled = false;
    $("adminUploadBtn").textContent = "☁️ Upload tất cả sheet đã chọn";
    loadDocuments();
});

$("adminCancelBtn").addEventListener("click", () => {
    $("adminUpload").value = "";
    $("adminSheetRow").style.display = "none";
    $("adminSheetList").innerHTML = "";
    $("adminPreview").textContent = "";
    $("adminUploadBtn").disabled = true;
    $("adminCancelBtn").style.display = "none";
    sheetData.clear();
    adminWorkbook = null;
});

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
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        // Group by subject
        const grouped = new Map();
        docs.forEach(d => {
            const subject = d.subject || "Chung";
            if (!grouped.has(subject)) grouped.set(subject, []);
            grouped.get(subject).push(d);
        });

        // Get all subjects for filter
        const subjects = Array.from(grouped.keys()).sort();

        // Build filter dropdown and grouped tables
        container.innerHTML = `
            <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
                <label style="font-weight:600;">Lọc theo môn:</label>
                <select id="subjectFilter" style="padding:6px 12px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
                    <option value="all">Tất cả</option>
                    ${subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
                </select>
            </div>
            <div id="docsTables">
                ${Array.from(grouped.entries()).map(([subject, docsList]) => `
                    <div class="subject-group" data-subject="${escapeHtml(subject)}">
                        <h3 style="margin:16px 0 8px 0;color:var(--primary);font-size:16px;">📚 ${escapeHtml(subject)}</h3>
                        <table class="admin-table">
                            <thead><tr><th>Mã</th><th>Tiêu đề</th><th>Câu hỏi</th><th>Lượt dùng</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
                            <tbody>
                            ${docsList.map((d) => `
                                <tr id="doc-row-${d.code}">
                                    <td><code class="code-badge" onclick="copyCode('${d.code}')" title="Click để sao chép">${d.code}</code></td>
                                    <td>
                                        <span id="title-display-${d.code}">${escapeHtml(d.title || "")}</span>
                                        ${d.disabled ? '<span style="margin-left:6px;font-size:11px;background:var(--danger-bg);color:var(--danger);padding:2px 6px;border-radius:4px;font-weight:600;">TẮT</span>' : ''}
                                        <input type="text" id="title-edit-${d.code}" value="${escapeHtml(d.title || "")}" style="display:none;width:100%;" />
                                    </td>
                                    <td>${(d.questions || []).length}</td>
                                    <td>${d.usageCount || 0}</td>
                                    <td>${formatTs(d.createdAt)}</td>
                                    <td class="action-btns">
                                        <button class="ghost btn-sm" onclick="editDocTitle('${d.code}')">✏️</button>
                                        <button class="ghost btn-sm ${d.disabled ? '' : 'warning'}" onclick="toggleDoc('${d.code}', ${!d.disabled})" title="${d.disabled ? 'Bật tài liệu' : 'Tắt tài liệu'}">
                                            ${d.disabled ? '▶️ Bật' : '⏸️ Tắt'}
                                        </button>
                                        <button class="ghost btn-sm danger" onclick="deleteDoc('${d.code}', '${escapeHtml(d.title || d.code)}')">🗑️</button>
                                    </td>
                                </tr>`
                            ).join("")}
                            </tbody>
                        </table>
                    </div>`
                ).join("")}
            </div>
            <p style="color:var(--text-muted);font-size:13px;margin-top:8px;">Tổng: ${docs.length} tài liệu</p>`;

        // Add filter functionality
        $("subjectFilter").addEventListener("change", (e) => {
            const selected = e.target.value;
            document.querySelectorAll(".subject-group").forEach(group => {
                if (selected === "all" || group.dataset.subject === selected) {
                    group.style.display = "block";
                } else {
                    group.style.display = "none";
                }
            });
        });
    } catch (err) {
        container.innerHTML = `<p style="color:var(--danger)">Lỗi: ${err.message}</p>`;
    }
}

window.editDocTitle = function (code) {
    const display = $(`title-display-${code}`);
    const input = $(`title-edit-${code}`);
    if (input.style.display === "none") {
        display.style.display = "none"; input.style.display = "inline-block"; input.focus();
        let saveBtn = $(`save-btn-${code}`);
        if (!saveBtn) {
            saveBtn = document.createElement("button");
            saveBtn.className = "btn-sm"; saveBtn.textContent = "💾 Lưu"; saveBtn.id = `save-btn-${code}`;
            saveBtn.onclick = () => saveDocTitle(code, input.value.trim());
            input.after(saveBtn);
        }
        input.onkeydown = async (e) => {
            if (e.key === "Enter") await saveDocTitle(code, input.value.trim());
            if (e.key === "Escape") { display.style.display = ""; input.style.display = "none"; saveBtn.remove(); }
        };
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
        showToast("🗑️ Đã xóa tài liệu.");
    } catch (err) { showToast("❌ Lỗi: " + err.message); }
};

window.toggleDoc = async function (code, disabled) {
    try {
        await adminToggleDocument(code, disabled);
        showToast(disabled ? `⏸️ Đã tắt tài liệu ${code}` : `▶️ Đã bật tài liệu ${code}`);
        loadDocuments();
    } catch (err) { showToast("❌ Lỗi: " + err.message); }
};

window.toggleBan = async function (uid, banned) {
    const action = banned ? "chặn" : "bỏ chặn";
    if (!confirm(`${banned ? "Chặn" : "Bỏ chặn"} người dùng này?`)) return;
    try {
        await adminToggleBan(uid, banned);
        showToast(banned ? "🚫 Đã chặn người dùng." : "✅ Đã bỏ chặn người dùng.");
        loadUsers();
    } catch (err) { showToast("❌ Lỗi: " + err.message); }
};

// ================================================================
//  TAB FILE CỦA USER
// ================================================================
$("refreshUploadsBtn").addEventListener("click", loadUserUploads);

async function loadUserUploads() {
    const container = $("uploadsList");
    container.innerHTML = "<p style='color:var(--text-muted)'>Đang tải...</p>";
    try {
        const uploads = await adminGetAllUserUploads();
        if (!uploads.length) {
            container.innerHTML = "<p style='color:var(--text-muted)'>Chưa có file nào.</p>";
            return;
        }
        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr><th>Thời gian</th><th>User</th><th>File / Sheet</th><th>Câu hỏi</th><th>Trạng thái</th><th>Thao tác</th></tr>
                </thead>
                <tbody>
                ${uploads.map((u) => `
                    <tr id="upload-row-${u.id}">
                        <td>${formatTs(u.uploadedAt)}</td>
                        <td>
                            <div style="font-weight:600;">${escapeHtml(u.displayName || "(ẩn danh)")}</div>
                            <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(u.email || "")}</div>
                        </td>
                        <td>
                            <div>${escapeHtml(u.fileName || "")}</div>
                            <div style="font-size:12px;color:var(--text-muted);">Sheet: ${escapeHtml(u.sheetName || "")}</div>
                        </td>
                        <td>${u.questionCount || 0}</td>
                        <td>
                            ${u.status === "converted"
                ? `<span style="color:var(--success);">✅ Đã tạo mã <code class="code-badge" onclick="copyCode('${u.convertedCode}')">${u.convertedCode}</code></span>`
                : `<span style="color:var(--warning);">⏳ Chờ xử lý</span>`}
                        </td>
                        <td class="action-btns">
                            ${u.status !== "converted" ? `
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <input type="text" id="convert-subject-${u.id}"
                                    placeholder="Môn học..."
                                    style="font-size:12px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--text);width:180px;" />
                                <input type="text" id="convert-title-${u.id}"
                                    placeholder="Tiêu đề tài liệu..."
                                    value="${escapeHtml(u.sheetName || u.fileName || "")}"
                                    style="font-size:12px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--text);width:180px;" />
                                <button class="btn-sm" onclick="convertUpload('${u.id}')">⚡ Tạo tài liệu chính thức</button>
                            </div>` : ""}
                            <button class="ghost btn-sm danger" onclick="deleteUpload('${u.id}')">🗑️</button>
                        </td>
                    </tr>`
        ).join("")}
                </tbody>
            </table>
            <p style="color:var(--text-muted);font-size:13px;margin-top:8px;">Tổng: ${uploads.length} file</p>`;
    } catch (err) {
        container.innerHTML = `<p style="color:var(--danger)">Lỗi: ${err.message}<br>Kiểm tra Firestore rules (cần cho admin đọc collection userUploads).</p>`;
    }
}

window.convertUpload = async function (uploadId) {
    const titleInput = $(`convert-title-${uploadId}`);
    const subjectInput = $(`convert-subject-${uploadId}`);
    const title = titleInput?.value.trim();
    const subject = subjectInput?.value.trim() || "";
    if (!title) { showToast("Nhập tiêu đề trước."); titleInput?.focus(); return; }
    try {
        const code = await adminConvertUpload(uploadId, title, subject, currentAdminUser.uid);
        showToast(`✅ Đã tạo tài liệu chính thức! Mã: ${code}`);
        loadUserUploads();
        loadDocuments();
    } catch (err) { showToast("❌ Lỗi: " + err.message); }
};

window.deleteUpload = async function (id) {
    if (!confirm("Xóa file này?")) return;
    try {
        await adminDeleteUserUpload(id);
        $(`upload-row-${id}`)?.remove();
        showToast("🗑️ Đã xóa.");
    } catch (err) { showToast("❌ Lỗi: " + err.message); }
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
                <thead><tr><th>Tên</th><th>Email</th><th>Role</th><th>Ngày tạo</th><th>Câu sai</th><th>Bài làm</th><th>Thao tác</th></tr></thead>
                <tbody>
                ${users.map((u) => `
                    <tr>
                        <td>${escapeHtml(u.displayName || "(chưa đặt)")}${u.banned ? ' <span style="font-size:11px;background:var(--danger-bg);color:var(--danger);padding:2px 6px;border-radius:4px;font-weight:600;">CHẶN</span>' : ''}</td>
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
                        <td class="action-btns">
                            <button class="ghost btn-sm" onclick="sendReset('${escapeHtml(u.email)}')">📧 Reset MK</button>
                            <button class="ghost btn-sm ${u.banned ? '' : 'danger'}" onclick="toggleBan('${u.uid}', ${!u.banned})">
                                ${u.banned ? '✅ Bỏ chặn' : '🚫 Chặn'}
                            </button>
                            <button class="ghost btn-sm danger" onclick="clearUserData('${u.uid}', '${escapeHtml(u.displayName || u.email)}')">🗑️ Xóa data</button>
                        </td>
                    </tr>`
        ).join("")}
                </tbody>
            </table>
            <p style="color:var(--text-muted);font-size:13px;margin-top:8px;">Tổng: ${users.length} người dùng</p>`;
    } catch (err) {
        container.innerHTML = `<p style="color:var(--danger)">Lỗi: ${err.message}</p>`;
    }
}

window.changeRole = async function (uid, role) {
    try { await adminSetRole(uid, role); showToast("✅ Đã đổi role."); }
    catch (err) { showToast("❌ Lỗi: " + err.message); }
};

window.sendReset = async function (email) {
    if (!email) { showToast("❌ User này không có email."); return; }
    if (!confirm(`Gửi email reset mật khẩu đến:\n${email}?`)) return;
    try {
        await resetPasswordEmail(email);
        showToast(`✅ Đã gửi email reset đến ${email}`);
    } catch (err) { showToast("❌ Lỗi: " + err.message); }
};

window.clearUserData = async function (uid, name) {
    if (!confirm(`Xóa toàn bộ câu sai và lịch sử của "${name}"?`)) return;
    try {
        const { db } = await import("./firebase.js");
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        await updateDoc(doc(db, "users", uid), { wrongQuestions: [], attempts: [] });
        showToast("🗑️ Đã xóa data user.");
        loadUsers();
    } catch (err) { showToast("❌ Lỗi: " + err.message); }
};

// ================================================================
//  COPY CODE
// ================================================================
window.copyCode = function (code) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code).then(() => showToast(`📋 Đã sao chép: ${code}`)).catch(() => fallbackCopy(code));
    } else { fallbackCopy(code); }
};
function fallbackCopy(code) {
    const el = document.createElement("textarea");
    el.value = code; el.style.cssText = "position:fixed;top:-9999px;left:-9999px;";
    document.body.appendChild(el); el.focus(); el.select();
    try { document.execCommand("copy"); showToast(`📋 Đã sao chép: ${code}`); }
    catch { prompt("Sao chép mã này:", code); }
    document.body.removeChild(el);
}

// ================================================================
//  TAB HỆ THỐNG
// ================================================================
async function loadSystemSettings() {
    try {
        const settings = await getSystemSettings();
        $("maintenanceToggle").checked = !!settings.maintenanceMode;

        // Thống kê
        const [users, docs] = await Promise.all([
            adminGetAllUsers().catch(() => []),
            adminGetAllDocuments().catch(() => []),
        ]);
        const banned = users.filter((u) => u.banned).length;
        const disabledDocs = docs.filter((d) => d.disabled).length;
        const totalAttempts = users.reduce((s, u) => s + (u.attempts?.length || 0), 0);
        $("systemStats").innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-top:8px;">
                ${statCard("👥 Tổng user", users.length)}
                ${statCard("🚫 Đang chặn", banned, banned > 0 ? "var(--danger)" : "")}
                ${statCard("📁 Tài liệu", docs.length)}
                ${statCard("⏸️ Đang tắt", disabledDocs, disabledDocs > 0 ? "var(--warning)" : "")}
                ${statCard("📝 Tổng bài làm", totalAttempts)}
            </div>`;
    } catch (err) {
        $("systemStats").textContent = "Lỗi: " + err.message;
    }
}

function statCard(label, value, color = "") {
    return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;text-align:center;">
        <div style="font-size:1.5rem;font-weight:700;color:${color || "var(--primary)"};">${value}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${label}</div>
    </div>`;
}

$("saveSystemBtn")?.addEventListener("click", async () => {
    const maintenance = $("maintenanceToggle").checked;
    try {
        await adminUpdateSystemSettings({ maintenanceMode: maintenance });
        $("systemSaveStatus").textContent = "✅ Đã lưu!";
        setTimeout(() => { $("systemSaveStatus").textContent = ""; }, 2000);
    } catch (err) {
        $("systemSaveStatus").textContent = "❌ " + err.message;
    }
});

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

function showToast(msg) {
    let toast = document.getElementById("adminToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "adminToast";
        toast.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
            background:#323232;color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;
            font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:9999;
            transition:opacity 0.3s;white-space:nowrap;`;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = "0"; }, 2500);
}
