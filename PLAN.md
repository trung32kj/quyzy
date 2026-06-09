# Kế hoạch phát triển Quiz PWA

Chia thành 9 milestone, mỗi milestone có thể giao cho Cascade làm trong 1 buổi. Đánh dấu `[x]` khi xong.

---

## M1 — Refactor & cấu trúc dự án  *(nền tảng)*  ✅ DONE

- [x] Tạo skeleton folder.
- [x] Tách module: `js/utils.js`, `js/parser.js`, `js/quiz.js`, `js/app.js`, `css/app.css`, `index.html`.
- [x] `js/parser.js` auto-detect 2 schema:
  - **Schema A "ĐH VN"**: cột `CauHoi`, `TraLoi1..4`. Đáp án đúng nhận diện qua: (1) dấu `*` cuối option, (2) **cell tô màu nền** (fill color khác trắng) — quan trọng cho file `tutuonghochiminh.xlsx`.
  - **Schema B "đơn giản"**: cột `Câu hỏi`, `A`, `B`, `C`, `D`, `Đáp án`.
- [x] `js/quiz.js`: xáo câu hỏi + xáo A/B/C/D Fisher-Yates đúng chuẩn.
- [x] `vendor/xlsx.full.min.js` (881 KB, dùng `cellStyles: true`).
- [x] Verify: load `samples/tutuonghochiminh.xlsx` → **284/285 câu** (1 dòng không hợp lệ bị bỏ qua); chấm điểm chính xác.
- [x] Test E2E qua Playwright: chọn đúng → "✅ Chính xác", chọn sai → hiển thị đáp án đúng, không chọn → "⚠️ Chưa trả lời".

## M2 — Storage (IndexedDB) & lưu tiến độ  ✅ DONE

- [x] `vendor/idb-keyval.umd.js` (4.8 KB).
- [x] `js/storage.js`: `saveCurrentSession` / `loadCurrentSession` / `clearCurrentSession`, `saveAttempt` / `getAllAttempts` / `clearAttempts`.
- [x] Auto-save (debounce 300ms) khi user pick + chuyển vòng + nộp.
- [x] Banner "Tiếp tục phiên trước?" khi mở lại; lưu cả `questions` để resume offline (không cần upload lại).
- [x] Lưu attempt summary (điểm + danh sách câu sai) sau mỗi lần nộp vòng.
- [x] UI Lịch sử: bảng các lần nộp, có nút xoá lịch sử.
- [x] Test E2E: nộp vòng → refresh → resume → state đầy đủ (feedback, score, đúng nút next/submit).

## M3 — PWA shell (cài được, offline)  ✅ DONE

- [x] `manifest.webmanifest`: name, short_name, theme `#1a73e8`, icons 192/512/maskable.
- [x] `icons/` 4 file PNG (sinh bằng `make_icons.py` + Pillow).
- [x] `sw.js`: cache app shell 15 file, chiến lược cache-first + fallback `index.html` cho navigation offline.
- [x] Đăng ký SW trong `app.js` (chỉ khi `serviceWorker in navigator`).
- [x] Test E2E: SW active, cache đủ 15 file, **reload với offline=true vẫn render đầy đủ**.

## M4 — UI/UX nâng cấp  ✅ DONE

- [x] CSS thuần với CSS variables (không cần Tailwind CLI → giữ offline-first đơn giản).
- [x] **Dark mode toggle** với localStorage + auto-detect `prefers-color-scheme`. No-flash bằng inline script trong `<head>`.
- [x] Layout responsive: mobile-first, breakpoints 600px / 1024px.
- [x] Sticky topbar (có shadow khi scroll) + sticky progress bar.
- [x] Animation `fadeIn` cho mỗi câu hỏi khi load vòng mới.
- [x] **Lucide-style SVG icons inline** (check, history, sun, moon) — offline-friendly.
- [x] Cards với border-left màu cho câu đúng/sai, options với hover state.
- [x] Test E2E: theme toggle hoạt động, lưu localStorage, viewport 375px (mobile) render đầy đủ.

## M5 — Tính năng quiz nâng cao

- [ ] **Xáo đáp án A/B/C/D** (giữ map đáp án đúng).
- [ ] **Timer**: cấu hình giây/câu hoặc phút/vòng; hết giờ tự nộp.
- [ ] **Chế độ thi**: ẩn feedback cho đến khi bấm "Nộp"; có thể bật/tắt trong settings.
- [ ] **Ôn câu sai**: nút "Tạo vòng từ câu sai" — đọc từ `getWrongQuestions()` của phiên hiện tại hoặc lịch sử.
- [ ] **Đánh dấu câu khó** (icon ⭐ bên cạnh câu) → lưu vào storage.

## M6 — Hỗ trợ ảnh & LaTeX

- [ ] Thêm cột Excel `Hình ảnh` (URL hoặc base64). Parser tự nhận diện.
- [ ] Render ảnh inline trong câu hỏi (lazy load).
- [ ] Tích hợp KaTeX: nội dung trong `$...$` hoặc `$$...$$` được render thành công thức.
- [ ] Cache ảnh từ URL bằng SW (chiến lược stale-while-revalidate).

## M7 — Thống kê & biểu đồ

- [ ] Thêm cột Excel `Chủ đề` (optional).
- [ ] Trang "Thống kê":
  - Pie: tỉ lệ đúng/sai/chưa-trả-lời tổng.
  - Bar: % đúng theo chủ đề.
  - Line: điểm theo các lần làm bài (lịch sử).
- [ ] Liệt kê top 5 câu sai nhiều nhất.

## M8 — Export PDF

- [ ] Thêm `vendor/jspdf.umd.min.js`.
- [ ] Nút "Xuất PDF" sau khi nộp:
  - Tiêu đề, ngày, sheet name, điểm.
  - Liệt kê câu hỏi + đáp án user + đáp án đúng + ✓/✗.
- [ ] Test font Việt (jsPDF cần load font hỗ trợ Unicode — `vendor/Roboto-Regular.ttf` chuyển base64).

## M9 — Deploy & test thật

- [ ] Tạo repo GitHub.
- [ ] Bật GitHub Pages (branch `main` /root).
- [ ] Test cài đặt PWA trên Android (Chrome → "Add to Home screen").
- [ ] Test offline: bật airplane mode, mở app vẫn vào được, làm bài lưu tiến độ.
- [ ] Lighthouse audit: PWA score ≥ 90.

---

## Thứ tự thực thi đề xuất

**Tuần 1 (gấp rút bản chạy được)**: M1 → M2 → M3 → M9 (deploy bản tối thiểu để test cài app).
**Tuần 2 (UX)**: M4 → M5.
**Tuần 3 (chất lượng)**: M6 → M7 → M8.

---

## Quyết định cần xác nhận trước khi bắt đầu M1

- **Build tool**: Vanilla JS thuần (không build) hay Vite (DX tốt hơn, cần Node)?
- **Framework**: Tailwind CLI (đề xuất) hay tiếp tục CSS thuần?
- **Mã nguồn mở Excel mẫu**: bạn có sẵn 1 file `.xlsx` thực tế để dùng làm sample? Nếu có, cho tôi biết đường dẫn để copy vào `samples/`.

