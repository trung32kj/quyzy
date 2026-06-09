# Quiz PWA — Trắc nghiệm offline cài được như app

App trắc nghiệm tiến hóa từ `main - Copy.html`: nâng cấp toàn diện UI/UX và đóng gói thành **Progressive Web App** — cài được trên điện thoại, **chạy offline 100%** sau lần mở đầu tiên.

## Tính năng chính (mục tiêu)

- Upload Excel (.xlsx) → chọn sheet → chia vòng (giữ tính năng cũ).
- **Cài như app** trên Android/iOS (PWA manifest + service worker).
- **Offline 100%**: sau lần mở đầu, vào không cần mạng.
- **Lưu tiến độ + lịch sử** (IndexedDB) — refresh không mất.
- **Timer** + **chế độ thi** (ẩn feedback đến khi nộp).
- **Ôn tập câu sai** tự động (gom thành vòng riêng).
- Xáo đáp án A/B/C/D + Fisher-Yates đúng chuẩn.
- **Dark mode**, **responsive** (Tailwind).
- Hỗ trợ **ảnh** + **công thức LaTeX** (KaTeX) trong câu hỏi.
- **Thống kê biểu đồ** (Chart.js): % đúng theo chủ đề, theo vòng, theo lần làm.
- **Export PDF** kết quả (jsPDF).

## Stack

- **HTML/CSS/JS thuần** (không framework lớn) — bundle nhỏ, dễ cache offline.
- **TailwindCSS** (CLI build → file css tĩnh, không CDN để offline được).
- **SheetJS** (`xlsx`) — parse Excel.
- **Chart.js** — biểu đồ thống kê.
- **KaTeX** — render LaTeX.
- **jsPDF** — export PDF.
- **IndexedDB** (qua `idb-keyval`) — storage.
- **Service Worker** (Workbox hoặc tự viết) — cache offline.

Tất cả thư viện sẽ tải về local trong `vendor/` để **service worker cache cùng app shell** → thật sự offline.

## Cấu trúc thư mục (kế hoạch)

```
quiz_pwa/
├── README.md
├── PLAN.md                    # Kế hoạch theo milestone
├── index.html                 # Entry point
├── manifest.webmanifest       # PWA manifest
├── sw.js                      # Service Worker
├── icons/                     # 192x192, 512x512, maskable
├── css/
│   ├── tailwind.css           # Build từ Tailwind CLI
│   └── app.css                # Custom override
├── js/
│   ├── app.js                 # Bootstrap, navigation
│   ├── parser.js              # Excel → questions[]
│   ├── quiz.js                # Quiz state machine
│   ├── storage.js             # IndexedDB wrapper
│   ├── stats.js               # Thống kê + Chart.js
│   ├── pdf.js                 # Export PDF
│   ├── render.js              # Render câu hỏi (ảnh, LaTeX)
│   └── utils.js               # Fisher-Yates, helpers
├── vendor/                    # Lib offline (không CDN)
│   ├── xlsx.full.min.js
│   ├── chart.umd.min.js
│   ├── katex.min.{js,css}
│   ├── jspdf.umd.min.js
│   └── idb-keyval.iife.min.js
└── samples/
    └── sample.xlsx
```

## Cách chạy (sau khi build)

```powershell
# Dev: chỉ cần local server (PWA cần HTTPS hoặc localhost)
cd d:\laptrinh\appcode\quiz_pwa
python -m http.server 8080
# Mở http://localhost:8080
```

Để cài thành app trên điện thoại: deploy GitHub Pages hoặc Netlify (HTTPS), mở Chrome trên Android → "Add to Home screen".

## Roadmap

Xem `PLAN.md` cho danh sách milestone chi tiết.
