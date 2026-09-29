// ===================================================================
// CodeJudge - Service Worker
// Caches core static assets for offline capability without intercepting Judge0 API or problem assets
// ===================================================================

const CACHE_NAME = "codejudge-cache-v2";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./highlighter.worker.js"
];

// 1. Install Event: Pre-cache static UI files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: Cache-First for static UI assets only, Network for all others
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests from the same origin
  if (event.request.method !== "GET" || url.origin !== location.origin) {
    return;
  }

  // Never intercept or cache problem metadata, templates, test cases, or external APIs
  if (
    url.pathname.includes("/problems/") ||
    url.hostname.includes("judge0") ||
    url.hostname.includes("dummyjson")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
