# Hướng dẫn Deployment lên http://trle123.xyz/

## Tổng quan
Quiz PWA đã được phát triển với 3 tab chính:
- **Tab Học**: Ôn tập với feedback ngay lập tức
- **Tab Thi**: Chế độ thi với timer, không hiển thị kết quả đến khi nộp bài
- **Tab Xem lại câu sai**: Xem và ôn tập các câu sai từ các lần thi trước

## Files cần upload lên server

### Files bắt buộc (cần thiết để app chạy):
```
quiz_pwa/
├── index.html                 # Entry point
├── manifest.webmanifest       # PWA manifest
├── sw.js                      # Service Worker (cho offline)
├── css/
│   └── app.css                # Styles
├── js/
│   ├── app.js                 # Main logic
│   ├── parser.js              # Excel parser
│   ├── quiz.js                # Quiz logic
│   ├── storage.js             # IndexedDB wrapper
│   └── utils.js               # Utilities
└── vendor/
    ├── xlsx.full.min.js       # SheetJS library
    └── idb-keyval.umd.js      # IndexedDB library
```

### Files tùy chọn (cho PWA hoàn chỉnh):
```
├── icons/                     # Icons cho PWA
│   ├── favicon.png
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable.png
```

### Files không cần upload:
```
├── README.md                  # Documentation
├── PLAN.md                    # Development plan
├── DEPLOYMENT.md              # File này
├── make_icons.py              # Script tạo icons
└── samples/                   # File mẫu test
```

## Cách deploy

### Cách 1: Upload qua FTP/SFTP
1. Kết nối đến server http://trle123.xyz/
2. Upload tất cả files trong danh sách "bắt buộc" vào thư mục public_html hoặc www
3. (Tùy chọn) Upload icons nếu muốn PWA có thể cài được

### Cách 2: Git
```bash
# Nếu server hỗ trợ Git
git init
git add .
git commit -m "Initial deployment"
git remote add origin user@trle123.xyz:path/to/repo
git push origin main
```

### Cách 3: Drag & Drop qua cPanel
1. Login vào cPanel
2. Mở File Manager
3. Vào thư mục public_html
4. Upload tất cả files cần thiết

## Cấu hình Server

### Yêu cầu tối thiểu:
- Web server (Apache, Nginx, hoặc bất kỳ static host)
- HTTPS (không bắt buộc nhưng khuyến khích cho PWA)
- Support cho Service Worker (hầu hết modern browsers đều hỗ trợ)

### MIME Types (nếu cần cấu hình):
```
.webmanifest  application/manifest+json
.js           application/javascript
.css          text/css
```

## Test sau khi deploy

1. **Truy cập**: http://trle123.xyz/
2. **Test tab switching**: Click qua lại giữa 3 tab
3. **Test upload Excel**: Upload file .xlsx để test parsing
4. **Test chế độ thi**: Bắt đầu thi với timer
5. **Test IndexedDB**: Refresh trang để kiểm tra storage
6. **Test PWA** (nếu có HTTPS):
   - Mở trên mobile Chrome
   - Kiểm tra "Add to Home Screen"
   - Test offline mode

## Troubleshooting

### Service Worker không hoạt động:
- Kiểm tra sw.js đã được upload đúng đường dẫn
- Kiểm tra console browser cho errors
- SW chỉ hoạt động trên HTTPS hoặc localhost

### IndexedDB không hoạt động:
- Kiểm tra browser có support IndexedDB
- Kiểm tra console cho errors
- Một số browsers blocking third-party cookies/sandbox

### Excel parsing không hoạt động:
- Kiểm tra vendor/xlsx.full.min.js đã được upload
- Kiểm tra file Excel không bị corrupted
- Test với file mẫu trong samples/

## Notes

- App hoạt động tốt cả online và offline (sau lần load đầu)
- Không cần backend server - tất cả logic chạy trên client
- Dữ liệu được lưu trong IndexedDB của browser
- PWA manifest cho phép cài app trên mobile (nếu có HTTPS)
