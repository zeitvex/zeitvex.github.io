// Service Worker：导航请求网络优先，静态资产缓存优先。
// 旧版本曾把 index.html 缓存为 RC_WheelLeg 落地页，这里升级缓存名并让 HTML 始终先走网络。
const CACHE = "zeitvex-site-v7";
const SHELL = [
  "./",
  "./index.html",
  "./rc-wheelleg.html",
  "./playground.html",
  "./404.html",
  "./manifest.json",
  "./favicon.png",
  "./assets/css/style.css",
  "./assets/css/site.css",
  "./assets/css/lain-playground.css",
  "./assets/js/i18n.js",
  "./assets/js/main.js",
  "./lang/zh.json",
  "./lang/en.json",
  "./assets/images/avatar.webp",
  "./assets/images/og-cover.jpg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  const isNavigation = req.mode === "navigate" || req.destination === "document";
  const isHtml = req.headers.get("accept")?.includes("text/html");
  const pathname = new URL(req.url).pathname;
  const isFreshAsset =
    req.destination === "style" ||
    req.destination === "script" ||
    pathname.endsWith(".json") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js");

  if (isNavigation || isHtml || isFreshAsset) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => new Response("", { status: 504, statusText: "Offline" }));
    }),
  );
});
