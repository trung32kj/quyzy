// Service Worker cho Quiz PWA — chiến lược cache-first cho app shell.
// Tăng VERSION mỗi lần đổi file static để force cập nhật cache.

const VERSION = "v1.4.0";
const CACHE_NAME = `quiz-pwa-${VERSION}`;

// Danh sách asset cần cache để app chạy 100% offline.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/parser.js",
  "./js/quiz.js",
  "./js/storage.js",
  "./js/utils.js",
  "./js/firebase.js",
  "./vendor/xlsx.full.min.js",
  "./vendor/idb-keyval.umd.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
  "./icons/favicon.png",
];

// === Install: pre-cache app shell ===
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// === Activate: dọn cache cũ ===
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// === Fetch: cache-first cho cùng origin; bỏ qua POST/cross-origin ===
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // bỏ qua external

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Cache thêm các file truy cập runtime (vd ảnh sau này)
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          // Offline + không có cache → fallback index.html cho navigation
          if (req.mode === "navigate") return caches.match("./index.html");
          return new Response("", { status: 504, statusText: "Offline" });
        });
    })
  );
});
