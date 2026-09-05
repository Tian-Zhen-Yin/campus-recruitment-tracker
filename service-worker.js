const CACHE_NAME = 'autumn-tracker-app-v3.0.1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/app-icon.svg',
  './icons/app-icon-512.png',
  './icons/apple-touch-icon.png',
  // OCR 运行时一并预缓存：全新安装后断网也能截图识别（中文模型内联在 chi_sim-data.js，
  // 首次使用时写入页面自己的 IndexedDB，无需网络）
  './ocr/tesseract.min.js',
  './ocr/chi_sim-data.js',
  './ocr/worker.min.js',
  './ocr/core/tesseract-core-simd-lstm.wasm.js',
  './ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js',
  './ocr/core/tesseract-core-lstm.wasm.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 只有应用自身的入口页才回退到 index.html；其它页面（如 download.html）离线按各自缓存处理
  const indexURL = new URL('./index.html', self.registration.scope).href;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (url.href === indexURL) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match(url.href === indexURL ? './index.html' : request).then(cached => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
